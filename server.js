// server.mjs
// Enhanced Instagram Reel Downloader with yt-dlp
// Features:
// - Better format selection: best[height<=1080] with fallback
// - Custom user-agent for mobile simulation and detection avoidance
// - JSON-structured cache with metadata (extraction time, duration, format)
// - Detailed logging for performance monitoring and debugging
// - Backward compatibility with legacy cache format

import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import Redis from 'ioredis';

const execFileAsync = promisify(execFile);
const app = express();

// Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('Redis error:', err));

// cookies path ensured
const COOKIES_PATH = process.env.COOKIES_PATH || './cookies/instagram.com_cookies.txt';
const cookiesDir = path.dirname(COOKIES_PATH);
if (!existsSync(cookiesDir)) mkdirSync(cookiesDir, { recursive: true });

// parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// simple request logger (helps debug 404 / wrong server)
app.use((req, res, next) => {
	console.log(new Date().toISOString(), req.method, req.url);
	// log body for POSTs so you can see what's coming in
	if (req.method === 'POST') console.log('body:', JSON.stringify(req.body));
	next();
});

// health endpoint so you can test server is your app
app.get('/', (req, res) => {
	res.json({ ok: true, service: 'yt-dlp-proxy' });
});

// Rate limit status endpoint
app.get('/status', (req, res) => {
	res.json({
		ok: true,
		service: 'yt-dlp-proxy',
		cookies: {
			path: COOKIES_PATH,
			exists: existsSync(COOKIES_PATH),
		},
		yt_dlp_version: 'latest',
	});
});

/**
 * Regex and helpers:
 * - Accept /p/, /reel/, /reels/, /stories/
 * - For /reel/ convert to /p/ for yt-dlp compatibility (optional)
 * - For /stories/ we extract username + story id and use that as cache key
 */
const instagramUrlRegex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|stories)\/[^\/]+(?:\/[^\/?#]+)?/i;

function convertReelToPostUrl(url) {
	// If it's a reel, produce an equivalent /p/<id>/ URL for yt-dlp
	const match = url.match(/\/reels?\/([A-Za-z0-9_-]+)/i);
	if (match && match[1]) return `https://www.instagram.com/p/${match[1]}/`;
	return url;
}

function extractCacheKey(url) {
	// post/reel -> key is post id
	const postMatch = url.match(/\/p\/([^\/?#]+)/i) || url.match(/\/reels?\/([^\/?#]+)/i);
	if (postMatch && postMatch[1]) return `post_${postMatch[1]}`;

	// stories -> /stories/{username}/{storyId}
	const storyMatch = url.match(/\/stories\/([^\/?#\/]+)\/([^\/?#\/]+)/i);
	if (storyMatch && storyMatch[1] && storyMatch[2]) {
		const username = storyMatch[1];
		const storyId = storyMatch[2];
		return `story_${username}_${storyId}`;
	}

	// fallback to whole URL hashed-ish (simple): base64 of URL (short)
	return `url_${Buffer.from(url).toString('base64').slice(0, 32)}`;
}

app.post('/download', async (req, res) => {
	// Declare variables outside try so they are accessible in catch (for logging)
	let cacheKey = null;
	let reelURL = null;
	let postURL = null;

	try {
		reelURL = String(req.body?.reelURL || '').trim();
		if (!reelURL || !instagramUrlRegex.test(reelURL)) {
			return res
				.status(400)
				.json({ success: false, error: 'Invalid or missing Instagram URL. Supported: /p/, /reel(s)/, /stories/.' });
		}

		// convert reels to /p/ for yt-dlp if possible; leave stories untouched
		postURL = convertReelToPostUrl(reelURL);
		cacheKey = extractCacheKey(postURL);

		// check cache
		const cachedData = await redis.get(cacheKey);
		if (cachedData) {
			console.log(`Cache hit: ${cacheKey}`);

			try {
				// Try to parse as JSON (new format)
				const parsedData = JSON.parse(cachedData);
				console.log(`Cache metadata for ${cacheKey}:`, {
					extractedAt: parsedData.extractedAt,
					duration: parsedData.duration,
					format: parsedData.format,
				});
				return res.json({
					success: true,
					downloadUrl: parsedData.downloadUrl,
					cached: true,
					originalUrl: reelURL,
					metadata: {
						extractedAt: parsedData.extractedAt,
						duration: parsedData.duration,
						format: parsedData.format,
					},
				});
			} catch (e) {
				// Fallback for old cache format (plain URL string)
				console.log(`Cache hit (legacy format): ${cacheKey}`);
				return res.json({
					success: true,
					downloadUrl: cachedData,
					cached: true,
					originalUrl: reelURL,
					metadata: { format: 'legacy_cache' },
				});
			}
		}
		console.log(`Cache miss: ${cacheKey} -> fetching via yt-dlp`);

		// Multiple user agents to rotate
		const userAgents = [
			'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
			'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
			'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36',
		];

		// Pick random user agent
		const customUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

		// Enhanced strategies with better cookie handling and fresh session management
		const strategies = [
			{
				name: 'fresh_browser_cookies',
				description: 'Extract fresh cookies from Chrome browser',
				args: [
					'-g',
					'-f',
					'best[height<=1080]/best',
					'--cookies-from-browser',
					'chrome',
					'--user-agent',
					customUserAgent,
					'--no-warnings',
					'--extractor-args',
					'instagram:api_version=web',
					postURL,
				],
			},
			{
				name: 'file_cookies_enhanced',
				description: 'Use cookies file with enhanced session handling',
				args: [
					'-g',
					'-f',
					'best[height<=1080]/best',
					'--cookies',
					COOKIES_PATH,
					'--user-agent',
					customUserAgent,
					'--no-warnings',
					'--extractor-args',
					'instagram:api_version=web',
					'--add-headers',
					'X-Instagram-AJAX:1',
					'--add-headers',
					'X-Requested-With:XMLHttpRequest',
					postURL,
				],
			},
			{
				name: 'firefox_fallback',
				description: 'Try Firefox browser cookies',
				args: [
					'-g',
					'-f',
					'best[height<=1080]/best',
					'--cookies-from-browser',
					'firefox',
					'--user-agent',
					customUserAgent,
					'--no-warnings',
					'--extractor-args',
					'instagram:api_version=web',
					postURL,
				],
			},
			{
				name: 'embed_only',
				description: 'Use embed page extraction (no login required)',
				args: [
					'-g',
					'-f',
					'best/worst',
					'--user-agent',
					customUserAgent,
					'--no-warnings',
					'--referer',
					'https://www.instagram.com/',
					'--add-headers',
					'Sec-Fetch-Dest:iframe',
					'--add-headers',
					'Sec-Fetch-Mode:navigate',
					postURL,
				],
			},
		];

		let lastError = null;
		let stdout = null;
		let stderr = null;
		let duration = 0;
		let usedStrategy = null;

		// Try each strategy with exponential backoff
		for (let i = 0; i < strategies.length; i++) {
			const strategy = strategies[i];
			try {
				console.log(`yt-dlp ${strategy.name} attempt for ${cacheKey}:`, {
					url: postURL,
					userAgent: customUserAgent.substring(0, 50) + '...',
					strategy: strategy.name,
					description: strategy.description,
				});

				const startTime = Date.now();
				const result = await execFileAsync('yt-dlp', strategy.args, {
					timeout: 120_000, // 2 minutes timeout
					maxBuffer: 15 * 1024 * 1024,
				});
				duration = Date.now() - startTime;
				stdout = result.stdout;
				stderr = result.stderr;
				usedStrategy = strategy.name;

				console.log(`yt-dlp ${strategy.name} execution completed in ${duration}ms`, {
					cacheKey,
					stdoutLength: stdout?.length || 0,
					stderrLength: stderr?.length || 0,
				});

				if (stderr && stderr.includes('WARNING')) {
					console.log(`yt-dlp ${strategy.name} warnings for ${cacheKey}:`, stderr.trim());
				}

				// If we got valid output, break the loop
				if (stdout && typeof stdout === 'string' && stdout.trim()) {
					const testUrls = stdout
						.trim()
						.split('\n')
						.filter((l) => /^https?:\/\//i.test(l.trim()));
					if (testUrls.length > 0) {
						console.log(`yt-dlp ${strategy.name} strategy succeeded for ${cacheKey}`);
						break;
					}
				}

				// If no URLs found but no error, continue to next strategy
				console.log(`yt-dlp ${strategy.name} returned no URLs for ${cacheKey}, trying next strategy...`);
			} catch (err) {
				lastError = err;
				console.log(`yt-dlp ${strategy.name} strategy failed for ${cacheKey}:`, {
					error: err.message,
					stderr: err.stderr || 'no stderr',
				});

				// Add small delay between strategies to avoid rapid requests
				if (i < strategies.length - 1) {
					console.log(`Waiting 2s before trying next strategy for ${cacheKey}...`);
					await new Promise((resolve) => setTimeout(resolve, 2000));
					continue;
				}
			}
		}

		if (!stdout || typeof stdout !== 'string') {
			console.error('yt-dlp no stdout after all strategies', {
				cacheKey,
				stderr,
				lastError: lastError?.message,
				strategiesTried: strategies.map((s) => s.name),
			});
			throw new Error(
				`yt-dlp returned no output after trying ${strategies.length} strategies. Last error: ${
					lastError?.message || 'unknown'
				}`,
			);
		}

		const urls = stdout
			.trim()
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => /^https?:\/\//i.test(l));

		const downloadUrl = urls.length ? urls[urls.length - 1] : null;
		if (!downloadUrl) {
			console.error('No download url found after all strategies', {
				cacheKey,
				stdout,
				stderr,
				strategiesTried: strategies.map((s) => s.name),
			});
			throw new Error(`No download URL found from yt-dlp after trying ${strategies.length} strategies`);
		}

		console.log(`yt-dlp success for ${cacheKey}:`, {
			downloadUrl: downloadUrl.substring(0, 100) + '...',
			totalUrls: urls.length,
			duration: `${duration}ms`,
			usedStrategy,
		});

		// Enhanced cache data with metadata
		const cacheData = {
			downloadUrl,
			originalUrl: reelURL,
			extractedAt: new Date().toISOString(),
			duration,
			format: 'best[height<=1080]/best',
			userAgent: customUserAgent.substring(0, 50) + '...',
			strategy: usedStrategy,
			urlCount: urls.length,
		};

		// cache (20 days). NOTE: direct urls can expire sooner — see suggestions below.
		const ttlInSeconds = 20 * 24 * 60 * 60;
		await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', ttlInSeconds);

		return res.json({
			success: true,
			downloadUrl: cacheData.downloadUrl,
			originalUrl: reelURL,
			metadata: {
				extractedAt: cacheData.extractedAt,
				duration: cacheData.duration,
				format: cacheData.format,
				strategy: cacheData.strategy,
				cached: false,
			},
		});
	} catch (err) {
		const errorMessage = err?.message || String(err);

		// Categorize Instagram-specific errors
		let errorCategory = 'unknown';
		let userFriendlyMessage = 'Download failed. Please try again later.';
		let statusCode = 500;

		if (errorMessage.includes('rate-limit reached') || errorMessage.includes('429')) {
			errorCategory = 'rate_limit';
			userFriendlyMessage = 'Instagram rate limit reached. Please wait a few minutes before trying again.';
			statusCode = 429;
		} else if (errorMessage.includes('login required') || errorMessage.includes('authentication')) {
			errorCategory = 'authentication';
			userFriendlyMessage = 'Authentication required. This content may be private or require login.';
			statusCode = 403;
		} else if (errorMessage.includes('not available') || errorMessage.includes('404')) {
			errorCategory = 'not_found';
			userFriendlyMessage = 'Content not found or has been deleted.';
			statusCode = 404;
		} else if (errorMessage.includes('timeout')) {
			errorCategory = 'timeout';
			userFriendlyMessage = 'Request timed out. Instagram may be slow, please try again.';
			statusCode = 408;
		}

		const errorDetails = {
			category: errorCategory,
			cacheKey: cacheKey || 'uninitialized',
			originalUrl: reelURL || req.body?.reelURL || 'unavailable',
			postURL: postURL || 'uninitialized',
			errorMessage,
			userFriendlyMessage,
			timestamp: new Date().toISOString(),
		};

		console.error('Download failed:', errorDetails);

		return res.status(statusCode).json({
			success: false,
			error: userFriendlyMessage,
			category: errorCategory,
			details: errorMessage,
			timestamp: errorDetails.timestamp,
			cacheKey: errorDetails.cacheKey,
		});
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
