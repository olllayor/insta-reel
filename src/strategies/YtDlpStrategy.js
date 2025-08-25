import { DownloadStrategy } from '../interfaces/DownloadStrategy.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * yt-dlp Strategy Implementation
 * Handles all yt-dlp related download operations
 */
export class YtDlpStrategy extends DownloadStrategy {
    constructor(cookiesPath) {
        super();
        this.cookiesPath = cookiesPath;
        this.userAgents = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36'
        ];
        
        this.strategies = [
            {
                name: 'fresh_browser_cookies',
                description: 'Extract fresh cookies from Chrome browser',
                priority: 1,
                buildArgs: (url, userAgent) => [
                    '-g', '-f', 'best[height<=1080]/best',
                    '--cookies-from-browser', 'chrome',
                    '--user-agent', userAgent,
                    '--no-warnings',
                    '--extractor-args', 'instagram:api_version=web',
                    url
                ]
            },
            {
                name: 'file_cookies_enhanced',
                description: 'Use cookies file with enhanced session handling',
                priority: 2,
                buildArgs: (url, userAgent) => [
                    '-g', '-f', 'best[height<=1080]/best',
                    '--cookies', this.cookiesPath,
                    '--user-agent', userAgent,
                    '--no-warnings',
                    '--extractor-args', 'instagram:api_version=web',
                    '--add-headers', 'X-Instagram-AJAX:1',
                    '--add-headers', 'X-Requested-With:XMLHttpRequest',
                    url
                ]
            },
            {
                name: 'firefox_fallback',
                description: 'Try Firefox browser cookies',
                priority: 3,
                buildArgs: (url, userAgent) => [
                    '-g', '-f', 'best[height<=1080]/best',
                    '--cookies-from-browser', 'firefox',
                    '--user-agent', userAgent,
                    '--no-warnings',
                    '--extractor-args', 'instagram:api_version=web',
                    url
                ]
            },
            {
                name: 'embed_only',
                description: 'Use embed page extraction (no login required)',
                priority: 4,
                buildArgs: (url, userAgent) => [
                    '-g', '-f', 'best/worst',
                    '--user-agent', userAgent,
                    '--no-warnings',
                    '--referer', 'https://www.instagram.com/',
                    '--add-headers', 'Sec-Fetch-Dest:iframe',
                    '--add-headers', 'Sec-Fetch-Mode:navigate',
                    url
                ]
            }
        ];
    }

    getName() {
        return 'yt-dlp';
    }

    getPriority() {
        return 1; // Primary tool
    }

    canHandle(url) {
        return url.includes('instagram.com');
    }

    getEstimatedDuration() {
        return 45000; // 45 seconds
    }

    /**
     * Execute yt-dlp with all strategies
     * @param {string} url - Instagram URL
     * @param {Object} options - Options
     * @returns {Promise<DownloadResult>}
     */
    async execute(url, options = {}) {
        const userAgent = this._getRandomUserAgent();
        let lastError = null;
        
        for (const strategy of this.strategies) {
            try {
                console.log(`Trying yt-dlp strategy: ${strategy.name}`, {
                    url: url.substring(0, 50) + '...',
                    userAgent: userAgent.substring(0, 50) + '...'
                });

                const startTime = Date.now();
                const args = strategy.buildArgs(url, userAgent);
                
                const result = await execFileAsync('yt-dlp', args, {
                    timeout: 120000, // 2 minutes
                    maxBuffer: 15 * 1024 * 1024
                });

                const duration = Date.now() - startTime;
                const downloadUrl = this._extractDownloadUrl(result.stdout);

                if (downloadUrl) {
                    console.log(`yt-dlp strategy ${strategy.name} succeeded in ${duration}ms`);
                    
                    return {
                        success: true,
                        downloadUrl,
                        tool: 'yt-dlp',
                        strategy: strategy.name,
                        duration,
                        metadata: {
                            userAgent: userAgent.substring(0, 50) + '...',
                            format: 'best[height<=1080]/best',
                            extractedAt: new Date().toISOString(),
                            priority: strategy.priority
                        }
                    };
                }

                console.log(`yt-dlp strategy ${strategy.name} returned no URLs, trying next...`);
                
            } catch (error) {
                lastError = error;
                console.log(`yt-dlp strategy ${strategy.name} failed:`, {
                    error: error.message,
                    stderr: error.stderr?.substring(0, 200) || 'no stderr'
                });

                // Small delay between strategies
                if (strategy !== this.strategies[this.strategies.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        // All strategies failed
        const errorCategory = this._categorizeError(lastError);
        
        return {
            success: false,
            tool: 'yt-dlp',
            strategy: 'all_failed',
            duration: 0,
            error: lastError?.message || 'All yt-dlp strategies failed',
            errorCategory,
            metadata: {
                strategiesTried: this.strategies.map(s => s.name),
                lastError: lastError?.stderr?.substring(0, 200)
            }
        };
    }

    /**
     * Get random user agent for rotation
     * @returns {string}
     */
    _getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Extract download URL from yt-dlp output
     * @param {string} stdout - Command output
     * @returns {string|null}
     */
    _extractDownloadUrl(stdout) {
        if (!stdout || typeof stdout !== 'string') return null;

        const urls = stdout
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(line => /^https?:\/\//i.test(line));

        return urls.length > 0 ? urls[urls.length - 1] : null;
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
        if (combined.includes('not available') || combined.includes('404')) {
            return 'not_found';
        }
        if (combined.includes('timeout')) {
            return 'timeout';
        }
        
        return 'unknown';
    }
}
