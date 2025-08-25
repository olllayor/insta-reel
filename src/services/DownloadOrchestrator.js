import { YtDlpStrategy } from '../strategies/YtDlpStrategy.js';
import { GalleryDlStrategy } from '../strategies/GalleryDlStrategy.js';
import { UrlService } from './UrlService.js';
import { CacheService } from './CacheService.js';
import { RateLimitManager } from './RateLimitManager.js';

/**
 * Download Orchestrator - Coordinates all download strategies
 * Implements Facade pattern to hide complexity from controllers
 */
export class DownloadOrchestrator {
    constructor(redisClient, cookiesPath) {
        this.cacheService = new CacheService(redisClient);
        this.rateLimitManager = new RateLimitManager();
        
        // Initialize strategies in priority order
        this.strategies = [
            new YtDlpStrategy(cookiesPath),
            new GalleryDlStrategy(cookiesPath)
        ].sort((a, b) => a.getPriority() - b.getPriority());

        this.metrics = {
            totalRequests: 0,
            cacheHits: 0,
            successfulDownloads: 0,
            failedDownloads: 0,
            strategiesUsed: new Map(),
            averageResponseTime: 0
        };
    }

    /**
     * Main download method - orchestrates the entire flow
     * @param {string} originalUrl - Original Instagram URL
     * @returns {Promise<Object>} - Download result
     */
    async download(originalUrl) {
        const startTime = Date.now();
        this.metrics.totalRequests++;

        try {
            // Step 1: Validate and normalize URL
            if (!UrlService.isValidInstagramUrl(originalUrl)) {
                throw new Error('Invalid Instagram URL. Supported: /p/, /reel(s)/, /stories/.');
            }

            const normalizedUrl = UrlService.normalizeUrl(originalUrl);
            const cacheKey = UrlService.extractCacheKey(normalizedUrl);
            const urlType = UrlService.getUrlType(normalizedUrl);

            console.log('Download request initiated', {
                originalUrl: originalUrl.substring(0, 50) + '...',
                normalizedUrl: normalizedUrl.substring(0, 50) + '...',
                cacheKey,
                urlType
            });

            // Step 2: Check cache first
            const cachedResult = await this.cacheService.get(cacheKey);
            if (cachedResult) {
                this.metrics.cacheHits++;
                console.log(`Cache hit for ${cacheKey}`);
                
                return {
                    success: true,
                    downloadUrl: cachedResult.downloadUrl,
                    cached: true,
                    originalUrl,
                    metadata: {
                        ...cachedResult.metadata,
                        cacheKey,
                        responseTime: Date.now() - startTime
                    }
                };
            }

            console.log(`Cache miss for ${cacheKey} - proceeding with download`);

            // Step 3: Prevent request stampede
            return await this.rateLimitManager.preventStampede(cacheKey, async () => {
                return await this._executeDownloadStrategies(normalizedUrl, originalUrl, cacheKey, startTime);
            });

        } catch (error) {
            this.metrics.failedDownloads++;
            
            return this._createErrorResponse(error, originalUrl, Date.now() - startTime);
        }
    }

    /**
     * Execute download strategies with fallback logic
     * @private
     */
    async _executeDownloadStrategies(normalizedUrl, originalUrl, cacheKey, startTime) {
        let lastResult = null;
        
        for (const strategy of this.strategies) {
            // Check if strategy can handle this URL
            if (!strategy.canHandle(normalizedUrl)) {
                console.log(`Strategy ${strategy.getName()} cannot handle this URL type`);
                continue;
            }

            // Apply rate limiting backoff
            await this.rateLimitManager.applyBackoff();

            try {
                console.log(`Executing strategy: ${strategy.getName()}`);
                
                const options = {
                    fallbackReason: lastResult ? 
                        `${lastResult.tool}_failed_${lastResult.errorCategory}` : 
                        'primary_attempt'
                };

                const result = await strategy.execute(normalizedUrl, options);

                if (result.success) {
                    // Success! Record metrics and cache result
                    this.metrics.successfulDownloads++;
                    this._updateStrategyMetrics(strategy.getName(), true);
                    this.rateLimitManager.recordSuccess();

                    const finalResult = {
                        success: true,
                        downloadUrl: result.downloadUrl,
                        cached: false,
                        originalUrl,
                        metadata: {
                            ...result.metadata,
                            cacheKey,
                            responseTime: Date.now() - startTime,
                            attemptCount: this.strategies.indexOf(strategy) + 1
                        }
                    };

                    // Cache the successful result
                    await this.cacheService.set(cacheKey, {
                        downloadUrl: result.downloadUrl,
                        tool: result.tool,
                        strategy: result.strategy,
                        originalUrl,
                        metadata: finalResult.metadata
                    });

                    return finalResult;

                } else {
                    // Strategy failed, record and try next
                    lastResult = result;
                    this._updateStrategyMetrics(strategy.getName(), false);
                    
                    if (result.errorCategory === 'rate_limit') {
                        this.rateLimitManager.recordFailure('instagram.com', 'rate_limit');
                    }

                    console.log(`Strategy ${strategy.getName()} failed: ${result.error}`);
                }

            } catch (error) {
                console.error(`Strategy ${strategy.getName()} threw exception:`, error.message);
                lastResult = {
                    tool: strategy.getName(),
                    error: error.message,
                    errorCategory: 'exception'
                };
            }
        }

        // All strategies failed
        this.metrics.failedDownloads++;
        const errorMessage = lastResult ? 
            `All download strategies failed. Last error: ${lastResult.error}` :
            'No suitable download strategy found';

        throw new Error(errorMessage);
    }

    /**
     * Create standardized error response
     * @private
     */
    _createErrorResponse(error, originalUrl, responseTime) {
        const errorMessage = error?.message || String(error);
        let errorCategory = 'unknown';
        let userFriendlyMessage = 'Download failed. Please try again later.';
        let statusCode = 500;

        // Categorize errors for user-friendly responses
        if (errorMessage.includes('Invalid Instagram URL')) {
            errorCategory = 'invalid_url';
            userFriendlyMessage = 'Invalid Instagram URL. Please provide a valid Instagram post, reel, or story URL.';
            statusCode = 400;
        } else if (errorMessage.includes('rate-limit') || errorMessage.includes('429')) {
            errorCategory = 'rate_limit';
            userFriendlyMessage = 'Instagram rate limit reached. Please wait a few minutes before trying again.';
            statusCode = 429;
        } else if (errorMessage.includes('authentication') || errorMessage.includes('login required')) {
            errorCategory = 'authentication';
            userFriendlyMessage = 'Authentication required. This content may be private or require login.';
            statusCode = 403;
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
            errorCategory = 'not_found';
            userFriendlyMessage = 'Content not found or has been deleted.';
            statusCode = 404;
        } else if (errorMessage.includes('timeout')) {
            errorCategory = 'timeout';
            userFriendlyMessage = 'Request timed out. Instagram may be slow, please try again.';
            statusCode = 408;
        }

        console.error('Download orchestration failed:', {
            originalUrl: originalUrl?.substring(0, 50) + '...',
            errorCategory,
            errorMessage,
            responseTime
        });

        return {
            success: false,
            error: userFriendlyMessage,
            category: errorCategory,
            details: errorMessage,
            metadata: {
                originalUrl: originalUrl || 'unknown',
                responseTime,
                timestamp: new Date().toISOString()
            },
            statusCode
        };
    }

    /**
     * Update strategy success/failure metrics
     * @private
     */
    _updateStrategyMetrics(strategyName, success) {
        if (!this.metrics.strategiesUsed.has(strategyName)) {
            this.metrics.strategiesUsed.set(strategyName, {
                attempts: 0,
                successes: 0,
                failures: 0
            });
        }

        const stats = this.metrics.strategiesUsed.get(strategyName);
        stats.attempts++;
        
        if (success) {
            stats.successes++;
        } else {
            stats.failures++;
        }
    }

    /**
     * Get service health and metrics
     * @returns {Promise<Object>}
     */
    async getHealthStatus() {
        const cacheStats = await this.cacheService.getStats();
        const rateLimitStats = this.rateLimitManager.getStats();

        const strategiesStats = {};
        for (const [name, stats] of this.metrics.strategiesUsed.entries()) {
            strategiesStats[name] = {
                ...stats,
                successRate: stats.attempts > 0 ? (stats.successes / stats.attempts * 100).toFixed(1) + '%' : '0%'
            };
        }

        return {
            service: 'instagram-downloader',
            healthy: true,
            timestamp: new Date().toISOString(),
            metrics: {
                totalRequests: this.metrics.totalRequests,
                cacheHitRate: this.metrics.totalRequests > 0 ? 
                    (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(1) + '%' : '0%',
                successRate: this.metrics.totalRequests > 0 ? 
                    (this.metrics.successfulDownloads / this.metrics.totalRequests * 100).toFixed(1) + '%' : '0%',
                strategiesStats
            },
            cache: cacheStats,
            rateLimiting: rateLimitStats,
            strategies: this.strategies.map(s => ({
                name: s.getName(),
                priority: s.getPriority(),
                estimatedDuration: s.getEstimatedDuration()
            }))
        };
    }

    /**
     * Reset metrics (useful for testing)
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            cacheHits: 0,
            successfulDownloads: 0,
            failedDownloads: 0,
            strategiesUsed: new Map(),
            averageResponseTime: 0
        };
        
        console.log('Metrics reset');
    }
}
