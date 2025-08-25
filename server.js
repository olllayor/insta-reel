// server.js
// Enhanced Instagram Reel Downloader with Clean Architecture
// Features:
// - SOLID principles with Strategy pattern for download tools
// - yt-dlp primary with gallery-dl fallback
// - Smart rate limiting and request stampede prevention
// - Comprehensive caching with Redis
// - Structured logging and metrics collection
// - Clean separation of concerns

import express from 'express';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import Redis from 'ioredis';
import { DownloadOrchestrator } from './src/services/DownloadOrchestrator.js';

const app = express();

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('Redis error:', err));

// Initialize download orchestrator
const COOKIES_PATH = process.env.COOKIES_PATH || './cookies/instagram.com_cookies.txt';
const cookiesDir = path.dirname(COOKIES_PATH);
if (!existsSync(cookiesDir)) mkdirSync(cookiesDir, { recursive: true });

const downloadOrchestrator = new DownloadOrchestrator(redis, COOKIES_PATH);

// parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// simple request logger (helps debug 404 / wrong server)
app.use((req, res, next) => {
	console.log(new Date().toISOString(), req.method, req.url);
	// log body for POSTs so you can see what's coming in
	if (req.method === 'POST') console.log('body:', JSON.stringify(req.body));
	next();
});

// Health endpoint
app.get('/', (req, res) => {
	res.json({ 
		ok: true, 
		service: 'instagram-downloader',
		architecture: 'clean-solid',
		tools: ['yt-dlp', 'gallery-dl']
	});
});

// Enhanced status endpoint with metrics
app.get('/status', async (req, res) => {
	try {
		const healthStatus = await downloadOrchestrator.getHealthStatus();
		res.json(healthStatus);
	} catch (error) {
		res.status(500).json({
			ok: false,
			service: 'instagram-downloader',
			error: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

// Main download endpoint - now uses clean architecture
app.post('/download', async (req, res) => {
	try {
		const reelURL = String(req.body?.reelURL || '').trim();
		
		if (!reelURL) {
			return res.status(400).json({
				success: false,
				error: 'Missing reelURL parameter',
				timestamp: new Date().toISOString()
			});
		}

		console.log('Download request received:', {
			url: reelURL.substring(0, 50) + '...',
			userAgent: req.get('user-agent')?.substring(0, 50) + '...'
		});

		// Use the orchestrator to handle the entire download flow
		const result = await downloadOrchestrator.download(reelURL);

		if (result.success) {
			res.json({
				success: true,
				downloadUrl: result.downloadUrl,
				cached: result.cached,
				originalUrl: result.originalUrl,
				metadata: result.metadata
			});
		} else {
			// Error case - return appropriate status code
			res.status(result.statusCode || 500).json({
				success: false,
				error: result.error,
				category: result.category,
				details: result.details,
				metadata: result.metadata
			});
		}

	} catch (error) {
		console.error('Unexpected error in download endpoint:', error);
		
		res.status(500).json({
			success: false,
			error: 'Internal server error occurred',
			details: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`🚀 Instagram Downloader Server running on port ${PORT}`);
	console.log(`📊 Architecture: Clean SOLID with Strategy pattern`);
	console.log(`🔧 Tools: yt-dlp (primary) + gallery-dl (fallback)`);
	console.log(`📈 Endpoints: GET / (health), GET /status (metrics), POST /download`);
});
