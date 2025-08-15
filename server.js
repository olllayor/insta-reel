import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import Redis from 'ioredis';

const execAsync = promisify(exec);
const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const COOKIES_PATH = process.env.COOKIES_PATH || './cookies/instagram.com_cookies.txt';

app.use(express.json());

function convertReelToPostUrl(url) {
	const match = url.match(/\/reels?\/([a-zA-Z0-9_-]+)/);
	if (match && match[1]) {
		return `https://www.instagram.com/p/${match[1]}/`;
	}
	return url;
}

app.post('/download', async (req, res) => {
	const { reelURL } = req.body;

	const instagramUrlRegex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[a-zA-Z0-9_-]+\/?/;
	if (!reelURL || !instagramUrlRegex.test(reelURL)) {
		return res.status(400).json({ success: false, error: 'Invalid or missing Instagram URL' });
	}

	try {
		const postURL = convertReelToPostUrl(reelURL);
		const reelIdMatch = postURL.match(/\/p\/([^\/]+)/);

		if (!reelIdMatch || !reelIdMatch[1]) {
			return res.status(400).json({ success: false, error: 'Could not extract reel ID from URL' });
		}
		const reelId = reelIdMatch[1];

		const cachedUrl = await redis.get(reelId);
		if (cachedUrl) {
			console.log(`Cache hit for reelId: ${reelId}`);
			return res.json({
				success: true,
				downloadUrl: cachedUrl,
				originalUrl: reelURL,
				cached: true,
			});
		}

		console.log(`No cache for: ${reelId}`);

		const command = `gallery-dl -g --cookies "${COOKIES_PATH}" "${postURL}"`;

		const { stdout, stderr } = await execAsync(command, {
			timeout: 60000,
		});

		if (stderr && !stdout) {
			throw new Error(`gallery-dl returned an error: ${stderr}`);
		}

		let downloadUrl = null;
		if (stdout) {
			const urls = stdout
				.trim()
				.split('\n')
				.map((line) => line.replace(/^ytdl:|^\|\s?/, '').trim())
				.filter((line) => line.startsWith('http'));

			downloadUrl = urls[urls.length - 1] || null;
		}

		if (!downloadUrl) {
			throw new Error('No download URL found');
		}

		// Save to Redis cache
		const ttlInSeconds = 20 * 24 * 60 * 60; // 20 days
		await redis.set(reelId, downloadUrl, 'EX', ttlInSeconds);

		res.json({
			success: true,
			downloadUrl: downloadUrl,
			originalUrl: reelURL,
		});
	} catch (error) {
		console.error('Download failed:', error);
		res.status(500).json({
			error: 'Download failed',
			details: error.message,
			stderr: error.stderr || 'No stderr output',
		});
	}
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
	console.log('Server is running on port ' + PORT);
});
