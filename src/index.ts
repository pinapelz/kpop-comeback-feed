import { Hono } from 'hono';
import { scrapeComeback } from './scraper';
import { comebacksToRss } from './rss';

import { infographicHtml } from './infographic';

type Bindings = Env & {
	CF_ACCOUNT_ID?: string;
	CF_BROWSER_RENDERING_TOKEN?: string;
};

const INFOGRAPHIC_HTML_CACHE_TTL_SECONDS = 60 * 10;
const INFOGRAPHIC_PNG_CACHE_TTL_SECONDS = 60 * 60 * 24;
const INFOGRAPHIC_TIME_ZONE = 'America/Los_Angeles';

const app = new Hono<{ Bindings: Bindings }>();

async function buildInfographicHtml(): Promise<string> {
	return infographicHtml(await scrapeComeback());
}

function pacificDayKey(now = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: INFOGRAPHIC_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now);
}

app.get('/infographic', async (c) => {
	const cache = caches.default;
	const cacheKey = new Request(c.req.url, { method: 'GET' });

	try {
		const cached = await cache.match(cacheKey);
		if (cached) return cached;
	} catch (error) {
		console.error('Failed to read infographic HTML from cache:', error);
	}

	const html = await buildInfographicHtml();
	const response = new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': `public, max-age=${INFOGRAPHIC_HTML_CACHE_TTL_SECONDS}`,
		},
	});

	try {
		await cache.put(cacheKey, response.clone());
	} catch (error) {
		console.error('Failed to write infographic HTML to cache:', error);
	}

	return response;
});

app.get('/infographic.png', async (c) => {
	const { CF_ACCOUNT_ID, CF_BROWSER_RENDERING_TOKEN } = c.env;
	if (!CF_ACCOUNT_ID || !CF_BROWSER_RENDERING_TOKEN) {
		return c.json({ error: 'PNG generation is not configured.' }, 503);
	}

	const dayKey = pacificDayKey();
	const pngCacheKey = new Request(`${new URL(c.req.url).origin}/__cache/infographic.png?day=${encodeURIComponent(dayKey)}`, {
		method: 'GET',
	});
	const cache = caches.default;

	try {
		const cached = await cache.match(pngCacheKey);
		if (cached) return cached;
	} catch (error) {
		console.error('Failed to read infographic PNG from cache:', error);
	}

	const html = await buildInfographicHtml();
	const renderResponse = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CF_ACCOUNT_ID)}/browser-run/screenshot`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${CF_BROWSER_RENDERING_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				html,
				viewport: { width: 1080, height: 800, deviceScaleFactor: 1 },
				screenshotOptions: { type: 'png', fullPage: true },
			}),
			signal: AbortSignal.timeout(60_000),
		},
	);
	if (!renderResponse.ok) {
		const details = await renderResponse.text();
		console.error('Browser screenshot failed:', renderResponse.status, details);
		return c.json({ error: 'Infographic screenshot generation failed.' }, 502);
	}

	const png = await renderResponse.arrayBuffer();
	const signature = new Uint8Array(png, 0, Math.min(png.byteLength, 8));
	if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)) {
		console.error('Browser screenshot endpoint did not return PNG bytes (likely corrupted)');
		return c.json({ error: 'Infographic screenshot generation failed.' }, 502);
	}

	const response = new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': `public, max-age=${INFOGRAPHIC_PNG_CACHE_TTL_SECONDS}, immutable`,
			ETag: `"${dayKey}"`,
		},
	});

	try {
		await cache.put(pngCacheKey, response.clone());
	} catch (error) {
		console.error('Failed to write infographic PNG to cache:', error);
	}

	return response;
});

app.get('/rss', async (c) => {
	const allowFutureDates = c.req.query('allowFuture') === 'true';
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let comebacks = await scrapeComeback();
	if (!allowFutureDates) {
		// only past comebacks allowed
		comebacks = comebacks.filter((c) => c.unixDate !== null);
		const pastComebacks = comebacks.filter((c) => {
			if (c.unixDate === null) return false;
			const comebackDate = new Date(c.unixDate * 1000);
			return comebackDate < today;
		});
		comebacks = pastComebacks;
	}
	return c.text(comebacksToRss(comebacks));
});

app.get('/api/comebacks', async (c) => {
	const comebacks = await scrapeComeback();
	return c.json(comebacks);
});

app.get('/api/today', async (c) => {
	const format = c.req.query('format') ?? 'json';
	const comebacks = await scrapeComeback();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);

	const todayComebacks = comebacks.filter((c) => {
		if (c.unixDate === null) return false;
		const comebackDate = new Date(c.unixDate * 1000);

		return comebackDate >= today && comebackDate < tomorrow;
	});
	if (format === 'json') return c.json(todayComebacks);
	else {
		let result = '';
		for (const comeback of todayComebacks) {
			result += `${comeback.artist} - ${comeback.dateTime}\n`;
		}
		return c.text(result);
	}
});

app.notFound((c) => {
	return c.json(
		{
			error: 'Not Found',
		},
		404,
	);
});

export default app;
