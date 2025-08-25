import { DownloadStrategy } from '../interfaces/DownloadStrategy.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * gallery-dl Strategy Implementation
 * Fallback strategy when yt-dlp fails
 */
export class GalleryDlStrategy extends DownloadStrategy {
    constructor(cookiesPath) {
        super();
        this.cookiesPath = cookiesPath;
        this.userAgents = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
        ];

        this.strategies = [
            {
                name: 'direct_url_extraction',
                description: 'Extract direct media URLs',
                priority: 1,
                buildArgs: (url, userAgent) => [
                    '--get-urls',
                    '--cookies', this.cookiesPath,
                    '--user-agent', userAgent,
                    '--retries', '3',
                    url
                ]
            },
            {
                name: 'json_metadata_extraction',
                description: 'Extract JSON metadata and find best video',
                priority: 2,
                buildArgs: (url, userAgent) => [
                    '--dump-json',
                    '--cookies', this.cookiesPath,
                    '--user-agent', userAgent,
                    '--retries', '3',
                    url
                ]
            },
            {
                name: 'simple_download',
                description: 'Simple download with minimal options',
                priority: 3,
                buildArgs: (url, userAgent) => [
                    '--get-urls',
                    '--user-agent', userAgent,
                    '--no-part',
                    url
                ]
            }
        ];
    }

    getName() {
        return 'gallery-dl';
    }

    getPriority() {
        return 2; // Secondary tool (fallback)
    }

    canHandle(url) {
        return url.includes('instagram.com');
    }

    getEstimatedDuration() {
        return 30000; // 30 seconds
    }

    /**
     * Execute gallery-dl with fallback strategies
     * @param {string} url - Instagram URL
     * @param {Object} options - Options
     * @returns {Promise<DownloadResult>}
     */
    async execute(url, options = {}) {
        const userAgent = this._getRandomUserAgent();
        let lastError = null;

        for (const strategy of this.strategies) {
            try {
                console.log(`Trying gallery-dl strategy: ${strategy.name}`, {
                    url: url.substring(0, 50) + '...',
                    userAgent: userAgent.substring(0, 50) + '...'
                });

                const startTime = Date.now();
                const args = strategy.buildArgs(url, userAgent);

                const result = await execFileAsync('gallery-dl', args, {
                    timeout: 90000, // 90 seconds
                    maxBuffer: 10 * 1024 * 1024
                });

                const duration = Date.now() - startTime;
                let downloadUrl = null;

                if (strategy.name === 'json_metadata_extraction') {
                    downloadUrl = this._extractUrlFromJson(result.stdout);
                } else {
                    downloadUrl = this._extractDirectUrl(result.stdout);
                }

                if (downloadUrl) {
                    console.log(`gallery-dl strategy ${strategy.name} succeeded in ${duration}ms`);
                    
                    return {
                        success: true,
                        downloadUrl,
                        tool: 'gallery-dl',
                        strategy: strategy.name,
                        duration,
                        metadata: {
                            userAgent: userAgent.substring(0, 50) + '...',
                            extractedAt: new Date().toISOString(),
                            priority: strategy.priority,
                            fallbackReason: options.fallbackReason || 'yt-dlp_failed'
                        }
                    };
                }

                console.log(`gallery-dl strategy ${strategy.name} returned no URLs, trying next...`);

            } catch (error) {
                lastError = error;
                console.log(`gallery-dl strategy ${strategy.name} failed:`, {
                    error: error.message,
                    stderr: error.stderr?.substring(0, 200) || 'no stderr'
                });

                // Small delay between strategies
                if (strategy !== this.strategies[this.strategies.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        }

        // All strategies failed
        const errorCategory = this._categorizeError(lastError);

        return {
            success: false,
            tool: 'gallery-dl',
            strategy: 'all_failed',
            duration: 0,
            error: lastError?.message || 'All gallery-dl strategies failed',
            errorCategory,
            metadata: {
                strategiesTried: this.strategies.map(s => s.name),
                lastError: lastError?.stderr?.substring(0, 200),
                fallbackReason: options.fallbackReason || 'yt-dlp_failed'
            }
        };
    }

    /**
     * Get random user agent
     * @returns {string}
     */
    _getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Extract URL from direct output
     * @param {string} stdout - Command output
     * @returns {string|null}
     */
    _extractDirectUrl(stdout) {
        if (!stdout || typeof stdout !== 'string') return null;

        const urls = stdout
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(line => /^https?:\/\//i.test(line))
            .filter(line => this._isVideoUrl(line));

        return urls.length > 0 ? urls[0] : null;
    }

    /**
     * Extract URL from JSON metadata
     * @param {string} stdout - JSON output
     * @returns {string|null}
     */
    _extractUrlFromJson(stdout) {
        if (!stdout || typeof stdout !== 'string') return null;

        try {
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    // Look for video URL in various possible fields
                    const videoUrl = data.url || 
                                   data.video_url || 
                                   data.media_url ||
                                   (data.media && data.media.url);

                    if (videoUrl && this._isVideoUrl(videoUrl)) {
                        return videoUrl;
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        } catch (error) {
            console.log('Failed to parse gallery-dl JSON output:', error.message);
        }

        return null;
    }

    /**
     * Check if URL is likely a video
     * @param {string} url - URL to check
     * @returns {boolean}
     */
    _isVideoUrl(url) {
        const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
        const lowerUrl = url.toLowerCase();
        
        return videoExtensions.some(ext => lowerUrl.includes(ext)) ||
               lowerUrl.includes('video') ||
               lowerUrl.includes('scontent') ||
               lowerUrl.includes('cdninstagram');
    }

    /**
     * Categorize error for proper handling
     * @param {Error} error - Error object
     * @returns {string}
     */
    _categorizeError(error) {
        if (!error) return 'unknown';

        const message = error.message?.toLowerCase() || '';
        const stderr = error.stderr?.toLowerCase() || '';
        const combined = `${message} ${stderr}`;

        if (combined.includes('rate-limit') || combined.includes('429')) {
            return 'rate_limit';
        }
        if (combined.includes('login required') || combined.includes('authentication')) {
            return 'authentication';
        }
        if (combined.includes('not found') || combined.includes('404')) {
            return 'not_found';
        }
        if (combined.includes('timeout')) {
            return 'timeout';
        }
        
        return 'unknown';
    }
}
