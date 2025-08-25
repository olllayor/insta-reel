/**
 * Rate Limit Manager with smart backoff and domain-specific tracking
 * Single Responsibility: Handle rate limiting and backoff strategies
 */
export class RateLimitManager {
    constructor() {
        this.domainFailures = new Map(); // domain -> {lastFailure, consecutiveFailures}
        this.activeRequests = new Map(); // cacheKey -> Promise (prevent stampede)
        this.maxConsecutiveFailures = 3;
        this.baseBackoffMs = 1000;
        this.maxBackoffMs = 30000;
    }

    /**
     * Check if we should apply backoff for a domain
     * @param {string} domain - Domain to check
     * @returns {number} - Backoff delay in ms (0 if no backoff needed)
     */
    getBackoffDelay(domain = 'instagram.com') {
        const failure = this.domainFailures.get(domain);
        if (!failure) return 0;

        const timeSinceLastFailure = Date.now() - failure.lastFailure;
        const expectedBackoff = Math.min(
            this.baseBackoffMs * Math.pow(2, failure.consecutiveFailures - 1),
            this.maxBackoffMs
        );

        if (timeSinceLastFailure < expectedBackoff) {
            return expectedBackoff - timeSinceLastFailure;
        }

        return 0;
    }

    /**
     * Record a successful request
     * @param {string} domain - Domain
     */
    recordSuccess(domain = 'instagram.com') {
        this.domainFailures.delete(domain);
        console.log(`Rate limit success recorded for ${domain}`);
    }

    /**
     * Record a failed request with rate limiting
     * @param {string} domain - Domain
     * @param {string} errorType - Type of error
     */
    recordFailure(domain = 'instagram.com', errorType = 'unknown') {
        const failure = this.domainFailures.get(domain) || {
            consecutiveFailures: 0,
            lastFailure: 0
        };

        failure.consecutiveFailures++;
        failure.lastFailure = Date.now();
        failure.errorType = errorType;

        this.domainFailures.set(domain, failure);

        console.log(`Rate limit failure recorded for ${domain}`, {
            consecutiveFailures: failure.consecutiveFailures,
            errorType,
            nextBackoffMs: this.getBackoffDelay(domain)
        });
    }

    /**
     * Apply backoff delay if needed
     * @param {string} domain - Domain
     * @returns {Promise<void>}
     */
    async applyBackoff(domain = 'instagram.com') {
        const delay = this.getBackoffDelay(domain);
        if (delay > 0) {
            console.log(`Applying backoff for ${domain}: ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Prevent request stampede for the same cache key
     * @param {string} cacheKey - Cache key
     * @param {Function} requestFn - Function that returns a Promise
     * @returns {Promise<any>}
     */
    async preventStampede(cacheKey, requestFn) {
        // If request is already in progress, wait for it
        if (this.activeRequests.has(cacheKey)) {
            console.log(`Request stampede prevented for ${cacheKey}`);
            return await this.activeRequests.get(cacheKey);
        }

        // Start new request and track it
        const requestPromise = requestFn();
        this.activeRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            // Clean up tracking
            this.activeRequests.delete(cacheKey);
        }
    }

    /**
     * Get rate limit statistics
     * @returns {Object}
     */
    getStats() {
        const stats = {
            activeRequests: this.activeRequests.size,
            domains: {}
        };

        for (const [domain, failure] of this.domainFailures.entries()) {
            stats.domains[domain] = {
                consecutiveFailures: failure.consecutiveFailures,
                lastFailure: new Date(failure.lastFailure).toISOString(),
                currentBackoffMs: this.getBackoffDelay(domain),
                errorType: failure.errorType
            };
        }

        return stats;
    }

    /**
     * Reset rate limit data for a domain
     * @param {string} domain - Domain to reset
     */
    reset(domain = 'instagram.com') {
        this.domainFailures.delete(domain);
        console.log(`Rate limit data reset for ${domain}`);
    }

    /**
     * Check if domain is currently rate limited
     * @param {string} domain - Domain to check
     * @returns {boolean}
     */
    isRateLimited(domain = 'instagram.com') {
        return this.getBackoffDelay(domain) > 0;
    }
}
