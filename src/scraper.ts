import * as cheerio from 'cheerio';

export interface Comeback {
	artist: string;
	dateTime: string;
	image: string | null;
	url: string;
	unixDate: number | null;
	/** Announced calendar date; not a fabricated midnight timestamp. */
	releaseDate?: string | null;
	release?: string | null;
	titleTrack?: string | null;
}

const CACHE_TTL = 60 * 120; // 2 hours
const COMEBACKS_CACHE_KEY = 'https://internal-cache.local/comebacks-v2';

const MONTHS: Record<string, number> = {
	// mapping for month names to their numeric values
	january: 0,
	february: 1,
	march: 2,
	april: 3,
	may: 4,
	june: 5,
	july: 6,
	august: 7,
	september: 8,
	october: 9,
	november: 10,
	december: 11,
};

export function parseKstDateToUnix(dateTimeStr: string): number | null {
	if (!dateTimeStr || !parseReleaseDate(dateTimeStr)) return null;

	const dateMatch = dateTimeStr.match(
		/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
	);

	if (!dateMatch) return null;

	const month = MONTHS[dateMatch[1].toLowerCase()];
	const day = parseInt(dateMatch[2], 10);
	const year = parseInt(dateMatch[3], 10);

	// translate 12-hour time to 24-hour time
	const time12Match = dateTimeStr.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
	if (!time12Match) return null; // invalid time format

	let hour = parseInt(time12Match[1], 10);
	const minute = time12Match[2] ? parseInt(time12Match[2], 10) : 0;
	if (hour < 1 || hour > 12 || minute > 59) return null;
	const isPm = time12Match[3].toUpperCase() === 'PM';

	if (isPm) {
		if (hour < 12) hour += 12;
	} else {
		if (hour === 12) hour = 0;
	}

	const utcMillis = Date.UTC(year, month, day, hour, minute, 0) - 9 * 60 * 60 * 1000;
	return Math.floor(utcMillis / 1000);
}

export function parseReleaseDate(text: string): string | null {
	const match = text.match(
		/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
	);
	if (!match) return null;
	const month = MONTHS[match[1].toLowerCase()];
	const day = Number(match[2]);
	const year = Number(match[3]);
	const date = new Date(Date.UTC(year, month, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseComebackHtml(html: string): Comeback[] {
	const $ = cheerio.load(html);
	const result: Comeback[] = [];
	$('.gspbgrid_item').each((_, element) => {
		const item = $(element);
		const artist = item.find('.gspb-dynamic-title-element').first().text().trim();
		const values = item
			.find('.gspb_meta_value')
			.map((_, el) => $(el).text().trim())
			.get();
		const dateIndex = values.findIndex((value) =>
			/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/i.test(value),
		);
		const dateTime = values[dateIndex];
		const releaseDate = dateTime ? parseReleaseDate(dateTime) : null;
		const url = item.find('.gspbgrid_item_link').first().attr('href') ?? '';
		if (!artist || !releaseDate || !url) return;
		const details = values.slice(dateIndex + 1).filter((value) => value && !/^[\d,.\s]+$/.test(value));
		result.push({
			artist,
			dateTime,
			url,
			releaseDate,
			release: details.find((value) => !/^(Title|Pre-release)\s*[–—-]/i.test(value)) ?? null,
			titleTrack: details.find((value) => /^(Title|Pre-release)\s*[–—-]/i.test(value)) ?? null,
			image: item.find('.gspb-dynamic-post-image img').first().attr('src') ?? null,
			unixDate: parseKstDateToUnix(dateTime),
		});
	});
	return result;
}

export function mergeComebacks(items: Comeback[]): Comeback[] {
	const unique = new Map<string, Comeback>();
	for (const item of items) {
		// One album can have separate pre-release and album-release schedule entries.
		const key = `${item.url}\n${item.dateTime}`;
		if (!unique.has(key)) unique.set(key, item);
	}
	return [...unique.values()].sort(
		(a, b) =>
			(a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') ||
			(a.unixDate ?? Infinity) - (b.unixDate ?? Infinity) ||
			a.artist.localeCompare(b.artist),
	);
}

export async function loadUpcomingPages(html: string): Promise<Comeback[]> {
	const $ = cheerio.load(html);
	const grids = $('.gspbgrid_list_builder[data-filterargs]').filter((_, el) => {
		const raw = $(el).attr('data-filterargs');
		if (!raw) return false;
		const args = JSON.parse(raw);
		return (
			args.post_type === 'album' &&
			args.order === 'asc' &&
			args.meta_key === 'release_date_unix' &&
			$(el).find('.gspb_ajax_pagination_btn').length > 0
		);
	});
	if (!grids.length) return [];
	const configMatch = html.match(/var\s+gspbpaginationvars\s*=\s*(\{[^;]+?\})\s*;/);
	if (!configMatch) throw new Error('Upcoming pagination configuration is missing');
	const config = JSON.parse(configMatch[1]);
	const endpoint = new URL(config.ajax_url, 'https://kpopofficial.com');
	if (endpoint.origin !== 'https://kpopofficial.com') throw new Error('Unexpected pagination origin');
	const results: Comeback[] = [];
	for (const element of grids.toArray()) {
		const grid = $(element);
		const id = grid.attr('id')!;
		if (!/^[\w-]+$/.test(id)) throw new Error('Invalid grid identifier');
		const blockMatch = html.match(new RegExp(`var\\s+${id.replaceAll('-', '_')}\\s*=\\s*"([^"\\n]+)"`));
		if (!blockMatch) throw new Error('Upcoming pagination template is missing');
		const perPage = Number(grid.attr('data-perpage'));
		let offset = Number(grid.find('.gspb_ajax_pagination_btn').first().attr('data-offset'));
		if (!Number.isInteger(perPage) || perPage <= 0 || !Number.isInteger(offset) || offset < 0) {
			throw new Error('Invalid pagination offset or page size');
		}
		const seen = new Set<string>();
		for (let page = 0; ; page++) {
			if (page >= 20) throw new Error('Upcoming pagination exceeded safety limit; refusing to cache an incomplete feed');
			const response = await fetch(endpoint, {
				method: 'POST',
				signal: AbortSignal.timeout(30_000),
				body: new URLSearchParams({
					action: 'gspb_filterpost',
					security: config.filternonce,
					filterargs: grid.attr('data-filterargs')!,
					template: grid.attr('data-template') ?? 'querybuilder',
					containerid: id,
					offset: String(offset),
					innerargs: grid.attr('data-innerargs') ?? '',
					blockinstance: decodeURIComponent(blockMatch[1]),
				}),
			});
			if (!response.ok) throw new Error(`Upcoming pagination failed: ${response.status}`);
			const payload = await response.json<{ success: boolean; data: string }>();
			if (!payload.success || typeof payload.data !== 'string') throw new Error('Invalid upcoming pagination response');
			const next = cheerio.load(payload.data);
			const count = next('.gspbgrid_item').length;
			const items = parseComebackHtml(payload.data);
			if (count && !items.length) throw new Error('Upcoming page contained no readable releases');
			const fingerprint = JSON.stringify(items.map((item) => [item.url, item.dateTime]));
			if (count && seen.has(fingerprint)) throw new Error('Upcoming pagination repeated a page');
			seen.add(fingerprint);
			results.push(...items);
			if (next('.gcnomoreclass').length || count < perPage) break;
			offset += perPage;
		}
	}
	return results;
}

export async function scrapeComeback(): Promise<Comeback[]> {
	const cache = caches.default;
	try {
		const cached = await cache.match(COMEBACKS_CACHE_KEY);
		if (cached) {
			return await cached.json<Comeback[]>();
		}
	} catch (e) {
		console.error('Failed to read from cache:', e);
	}

	const response = await fetch('https://kpopofficial.com/kpop-comebacks/', {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; kpop-comeback-feed)' },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`);
	const html = await response.text();
	const comebacks = mergeComebacks([...parseComebackHtml(html), ...(await loadUpcomingPages(html))]);
	if (!comebacks.length) throw new Error('No readable comeback cards found; source markup may have changed');

	try {
		const responseToCache = new Response(JSON.stringify(comebacks), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL}`,
			},
		});
		await cache.put(COMEBACKS_CACHE_KEY, responseToCache);
	} catch (e) {
		console.error('Failed to write to cache:', e);
	}

	return comebacks;
}
