import * as cheerio from 'cheerio';

export interface Comeback {
	artist: string;
	dateTime: string;
	image: string | null;
	url: string;
	unixDate: number | null;
}

const CACHE_TTL = 60 * 120; // 2 hours
const COMEBACKS_CACHE_KEY = 'https://internal-cache.local/comebacks';

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
	if (!dateTimeStr) return null;

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
	const isPm = time12Match[3].toUpperCase() === 'PM';

	if (isPm) {
		if (hour < 12) hour += 12;
	} else {
		if (hour === 12) hour = 0;
	}

	const utcMillis = Date.UTC(year, month, day, hour, minute, 0) - 9 * 60 * 60 * 1000;
	return Math.floor(utcMillis / 1000);
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

	const response = await fetch('https://kpopofficial.com/kpop-comebacks', {
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:154.0) Gecko/20100101 Firefox/154.0',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch page: ${response.status}`);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	const seenComebackUrls = new Set<string>();
	const comebacks: Comeback[] = $('.gspbgrid_item')
		.map((_, element) => {
			const $item = $(element);

			const artist = $item.find('.gspb-dynamic-title-element').first().text().trim();

			const dateTime = $item
				.find('.gspb_meta_value')
				.filter((_, el) =>
					/^(January|February|March|April|May|June|July|August|September|October|November|December)/.test($(el).text().trim()),
				)
				.first()
				.text()
				.trim();

			const image = $item.find('.gspb-dynamic-post-image img').first().attr('src') ?? null;

			const url = $item.find('.gspbgrid_item_link').first().attr('href') ?? '';
			if (seenComebackUrls.has(url)) return null;
			seenComebackUrls.add(url);

			const unixDate = parseKstDateToUnix(dateTime);
			if (!unixDate) return null; // the Trending Kpop event section has the same element structure, skip these

			return {
				artist,
				dateTime,
				image,
				url,
				unixDate,
			};
		})
		.get()
		.filter((item) => item.artist && item.dateTime);

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
