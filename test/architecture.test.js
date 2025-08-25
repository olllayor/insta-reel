import { YtDlpStrategy } from '../src/strategies/YtDlpStrategy.js';
import { GalleryDlStrategy } from '../src/strategies/GalleryDlStrategy.js';
import { UrlService } from '../src/services/UrlService.js';
import { CacheService } from '../src/services/CacheService.js';
import { RateLimitManager } from '../src/services/RateLimitManager.js';

/**
 * Simple test suite for the new architecture
 */
class TestSuite {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    async run() {
        console.log('🧪 Running Test Suite\n');

        for (const { name, testFn } of this.tests) {
            try {
                await testFn();
                console.log(`✅ ${name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${name}: ${error.message}`);
                this.failed++;
            }
        }

        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
}

// Create test suite
const suite = new TestSuite();

// URL Service Tests
suite.test('UrlService validates Instagram URLs correctly', () => {
    const validUrls = [
        'https://www.instagram.com/p/ABC123/',
        'https://instagram.com/reel/XYZ789/',
        'https://www.instagram.com/stories/user/123456/'
    ];

    const invalidUrls = [
        'https://youtube.com/watch?v=123',
        'https://tiktok.com/@user/video/123',
        'not a url'
    ];

    validUrls.forEach(url => {
        suite.assert(UrlService.isValidInstagramUrl(url), `Should validate ${url}`);
    });

    invalidUrls.forEach(url => {
        suite.assert(!UrlService.isValidInstagramUrl(url), `Should reject ${url}`);
    });
});

suite.test('UrlService normalizes URLs correctly', () => {
    const reelUrl = 'https://www.instagram.com/reel/ABC123/';
    const normalized = UrlService.normalizeUrl(reelUrl);
    suite.assert(normalized === 'https://www.instagram.com/p/ABC123/', 'Should convert reel to post URL');
});

suite.test('UrlService extracts cache keys correctly', () => {
    const postUrl = 'https://www.instagram.com/p/ABC123/';
    const cacheKey = UrlService.extractCacheKey(postUrl);
    suite.assert(cacheKey === 'post_ABC123', `Expected post_ABC123, got ${cacheKey}`);
});

// Strategy Tests
suite.test('YtDlpStrategy has correct configuration', () => {
    const strategy = new YtDlpStrategy('./cookies/test.txt');
    
    suite.assert(strategy.getName() === 'yt-dlp', 'Strategy name should be yt-dlp');
    suite.assert(strategy.getPriority() === 1, 'Should have priority 1');
    suite.assert(strategy.canHandle('https://instagram.com/p/123/'), 'Should handle Instagram URLs');
    suite.assert(!strategy.canHandle('https://youtube.com/watch?v=123'), 'Should not handle non-Instagram URLs');
});

suite.test('GalleryDlStrategy has correct configuration', () => {
    const strategy = new GalleryDlStrategy('./cookies/test.txt');
    
    suite.assert(strategy.getName() === 'gallery-dl', 'Strategy name should be gallery-dl');
    suite.assert(strategy.getPriority() === 2, 'Should have priority 2');
    suite.assert(strategy.canHandle('https://instagram.com/p/123/'), 'Should handle Instagram URLs');
});

// Rate Limit Manager Tests
suite.test('RateLimitManager tracks failures correctly', () => {
    const manager = new RateLimitManager();
    
    // Initially no backoff
    suite.assert(manager.getBackoffDelay() === 0, 'Should have no initial backoff');
    
    // Record failure
    manager.recordFailure('test.com', 'rate_limit');
    const backoff = manager.getBackoffDelay('test.com');
    suite.assert(backoff > 0, 'Should have backoff after failure');
    
    // Record success
    manager.recordSuccess('test.com');
    suite.assert(manager.getBackoffDelay('test.com') === 0, 'Should reset backoff after success');
});

// Mock Cache Service Test
suite.test('CacheService interface works correctly', () => {
    // Mock Redis client
    const mockRedis = {
        get: async (key) => null,
        set: async (key, value, ex, ttl) => 'OK',
        exists: async (key) => 0,
        del: async (key) => 1,
        info: async (section) => 'used_memory_human:1.5M',
        dbsize: async () => 42
    };

    const cache = new CacheService(mockRedis);
    suite.assert(cache.defaultTtl === 20 * 24 * 60 * 60, 'Should have correct default TTL');
});

// Run the tests
async function runTests() {
    const success = await suite.run();
    
    if (success) {
        console.log('\n🎉 All tests passed! Architecture is ready.');
    } else {
        console.log('\n❌ Some tests failed. Please check the implementation.');
        process.exit(1);
    }
}

// Export for external use or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(console.error);
}

export { TestSuite, runTests };
