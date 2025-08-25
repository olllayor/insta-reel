/**
 * Service for URL normalization and validation
 * Single Responsibility: Handle Instagram URL processing
 */
export class UrlService {
    static INSTAGRAM_URL_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|stories)\/[^\/]+(?:\/[^\/?#]+)?/i;

    /**
     * Validate Instagram URL
     * @param {string} url - URL to validate
     * @returns {boolean}
     */
    static isValidInstagramUrl(url) {
        return typeof url === 'string' && this.INSTAGRAM_URL_REGEX.test(url.trim());
    }

    /**
     * Normalize Instagram URL for processing
     * @param {string} url - Original URL
     * @returns {string} - Normalized URL
     */
    static normalizeUrl(url) {
        const trimmed = url.trim();
        
        // Convert /reels/ to /p/ for better compatibility
        const reelMatch = trimmed.match(/\/reels?\/([A-Za-z0-9_-]+)/i);
        if (reelMatch && reelMatch[1]) {
            return `https://www.instagram.com/p/${reelMatch[1]}/`;
        }
        
        return trimmed;
    }

    /**
     * Extract cache key from URL
     * @param {string} url - Instagram URL
     * @returns {string} - Cache key
     */
    static extractCacheKey(url) {
        // Post/reel -> key is post id
        const postMatch = url.match(/\/p\/([^\/?#]+)/i) || url.match(/\/reels?\/([^\/?#]+)/i);
        if (postMatch && postMatch[1]) {
            return `post_${postMatch[1]}`;
        }

        // Stories -> /stories/{username}/{storyId}
        const storyMatch = url.match(/\/stories\/([^\/?#\/]+)\/([^\/?#\/]+)/i);
        if (storyMatch && storyMatch[1] && storyMatch[2]) {
            return `story_${storyMatch[1]}_${storyMatch[2]}`;
        }

        // Fallback to URL hash
        return `url_${Buffer.from(url).toString('base64').slice(0, 32)}`;
    }

    /**
     * Determine URL type
     * @param {string} url - Instagram URL
     * @returns {'post'|'reel'|'story'|'unknown'}
     */
    static getUrlType(url) {
        if (url.includes('/p/')) return 'post';
        if (url.includes('/reel')) return 'reel';
        if (url.includes('/stories/')) return 'story';
        return 'unknown';
    }
}
