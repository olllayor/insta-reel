/**
 * Cache Service with JSON structured data and TTL management
 * Single Responsibility: Handle all caching operations
 */
export class CacheService {
    constructor(redisClient) {
        this.redis = redisClient;
        this.defaultTtl = 20 * 24 * 60 * 60; // 20 days in seconds
    }

    /**
     * Get cached download result
     * @param {string} cacheKey - Cache key
     * @returns {Promise<Object|null>} - Cached data or null
     */
    async get(cacheKey) {
        try {
            const cachedData = await this.redis.get(cacheKey);
            if (!cachedData) return null;

            try {
                // Try parsing as JSON (new format)
                const parsedData = JSON.parse(cachedData);
                console.log(`Cache hit (JSON): ${cacheKey}`, {
                    extractedAt: parsedData.extractedAt,
                    tool: parsedData.tool,
                    strategy: parsedData.strategy
                });
                return parsedData;
            } catch (e) {
                // Fallback for legacy cache (plain URL string)
                console.log(`Cache hit (legacy): ${cacheKey}`);
                return {
                    downloadUrl: cachedData,
                    cached: true,
                    tool: 'unknown',
                    strategy: 'legacy',
                    metadata: { format: 'legacy_cache' }
                };
            }
        } catch (error) {
            console.error(`Cache get error for ${cacheKey}:`, error.message);
            return null;
        }
    }

    /**
     * Store download result in cache
     * @param {string} cacheKey - Cache key
     * @param {Object} downloadResult - Result to cache
     * @param {number} ttl - TTL in seconds (optional)
     */
    async set(cacheKey, downloadResult, ttl = null) {
        try {
            const cacheData = {
                ...downloadResult,
                cachedAt: new Date().toISOString(),
                ttl: ttl || this.defaultTtl
            };

            await this.redis.set(
                cacheKey, 
                JSON.stringify(cacheData), 
                'EX', 
                ttl || this.defaultTtl
            );

            console.log(`Cached result for ${cacheKey}`, {
                tool: cacheData.tool,
                strategy: cacheData.strategy,
                ttl: cacheData.ttl
            });
        } catch (error) {
            console.error(`Cache set error for ${cacheKey}:`, error.message);
        }
    }

    /**
     * Check if key exists in cache
     * @param {string} cacheKey - Cache key
     * @returns {Promise<boolean>}
     */
    async exists(cacheKey) {
        try {
            return await this.redis.exists(cacheKey) === 1;
        } catch (error) {
            console.error(`Cache exists error for ${cacheKey}:`, error.message);
            return false;
        }
    }

    /**
     * Remove key from cache
     * @param {string} cacheKey - Cache key
     */
    async delete(cacheKey) {
        try {
            await this.redis.del(cacheKey);
            console.log(`Cache deleted: ${cacheKey}`);
        } catch (error) {
            console.error(`Cache delete error for ${cacheKey}:`, error.message);
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        try {
            const info = await this.redis.info('memory');
            const dbsize = await this.redis.dbsize();
            
            return {
                totalKeys: dbsize,
                memoryUsed: this._parseMemoryInfo(info),
                connected: true
            };
        } catch (error) {
            return {
                totalKeys: 0,
                memoryUsed: '0B',
                connected: false,
                error: error.message
            };
        }
    }

    _parseMemoryInfo(info) {
        const match = info.match(/used_memory_human:([^\r\n]+)/);
        return match ? match[1] : '0B';
    }
}
