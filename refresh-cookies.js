#!/usr/bin/env node

// Script to refresh Instagram cookies from Chrome browser
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const COOKIES_PATH = process.env.COOKIES_PATH || './cookies/instagram.com_cookies.txt';

async function refreshCookies() {
	try {
		console.log('🔄 Extracting fresh cookies from Chrome...');

		// Extract cookies using yt-dlp
		const { stdout, stderr } = await execFileAsync(
			'yt-dlp',
			[
				'--cookies',
				COOKIES_PATH,
				'--cookies-from-browser',
				'chrome',
				'--dump-single-json',
				'--no-download',
				'https://www.instagram.com/',
			],
			{
				timeout: 30000,
			},
		);

		if (stderr && stderr.includes('ERROR')) {
			throw new Error(`Cookie extraction failed: ${stderr}`);
		}

		console.log('✅ Cookies refreshed successfully!');
		console.log(`📁 Saved to: ${COOKIES_PATH}`);

		// Verify cookies file
		if (existsSync(COOKIES_PATH)) {
			console.log('✅ Cookie file exists and is ready to use');
		} else {
			console.log('❌ Cookie file was not created properly');
		}
	} catch (error) {
		console.error('❌ Failed to refresh cookies:', error.message);

		// Provide helpful instructions
		console.log('\n📋 Manual cookie refresh instructions:');
		console.log('1. Open Chrome and go to instagram.com');
		console.log('2. Log in to your Instagram account');
		console.log('3. Install "Get cookies.txt LOCALLY" Chrome extension');
		console.log('4. Click the extension and export cookies');
		console.log(`5. Save the file as: ${COOKIES_PATH}`);

		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	refreshCookies();
}
