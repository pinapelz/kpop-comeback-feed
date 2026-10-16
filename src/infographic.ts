import type { Comeback } from './scraper';


const TIME_ZONE = 'America/Los_Angeles';
const dateFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: TIME_ZONE,
	month: 'short',
	day: '2-digit',
	year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: TIME_ZONE,
	hour: 'numeric',
	minute: '2-digit',
	timeZoneName: 'short',
});

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(char) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[char]!,
	);
}

export function infographicHtml(comebacks: Comeback[], now = new Date()): string {
	const dayFormat = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const today = dayFormat.format(now);
	const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
	const cutoffDay = dayFormat.format(thirtyDaysFromNow);
	const dayOf = (item: Comeback) => (item.unixDate !== null ? dayFormat.format(new Date(item.unixDate * 1000)) : (item.releaseDate ?? ''));
	const upcoming = comebacks
		.filter((item) =>
			item.unixDate !== null
				? Number.isFinite(item.unixDate) && item.unixDate * 1000 >= now.getTime() && item.unixDate * 1000 <= thirtyDaysFromNow.getTime()
				: Boolean(item.releaseDate && item.releaseDate >= today && item.releaseDate <= cutoffDay),
		)
		.sort(
			(a, b) =>
				dayOf(a).localeCompare(dayOf(b)) ||
				(a.unixDate ?? Infinity) - (b.unixDate ?? Infinity) ||
				(a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') ||
				a.artist.localeCompare(b.artist, 'en'),
		).slice(0,14);
	const groups = new Map<string, Comeback[]>();
	for (const item of upcoming) {
		const date =
			item.unixDate !== null
				? dateFormat.format(new Date(item.unixDate * 1000))
				: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: '2-digit', year: 'numeric'}).format(
						new Date(`${item.releaseDate}T12:00:00Z`),
					) + '*';
		groups.set(date, [...(groups.get(date) ?? []), item]);
	}
	const sections = [...groups]
		.map(
			([date, items]) => `<section>
		<h2>${escapeHtml(date)}</h2><div class="releases">${items
			.map(
				(item) => `<div class="release">
		<div><strong>${escapeHtml(item.artist)}</strong>
		${item.release ? `<p class="detail">${escapeHtml(item.release)}</p>` : ''}
		${item.titleTrack ? `<p class="detail track">${escapeHtml(item.titleTrack)}</p>` : ''}</div>
		<time>${item.unixDate !== null ? escapeHtml(timeFormat.format(new Date(item.unixDate * 1000))) : 'Time TBA'}</time>
		</div>`,
			)
			.join('')}</div></section>`,
		)
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>K-pop comebacks · Pacific time</title><style>
	* { box-sizing: border-box; }
	body { margin: 0; width: 1080px; padding: 48px; background: #fbf9f5; color: #18151e; font-family: Georgia, 'Times New Roman', serif; }
	header { padding-bottom: 32px; }
	h1 { margin: 0 0 20px; font-size: 76px; letter-spacing: -4px; font-weight: 700; }
	.meta { display: flex; align-items: center; justify-content: space-between; gap: 20px; font: 18px Arial, sans-serif; color: #8662a2; }
	.badge { border-radius: 30px; padding: 12px 18px; background: #e8dfee; color: #46364e; }
	section { display: grid; grid-template-columns: 235px 1fr; gap: 28px; padding: 24px 0; border-top: 1px solid #bdb0c7; }
	h2 { font-size: 25px; line-height: 1.5; margin: 0; font-weight: 400; }
	.releases { border-left: 1px solid #d6cddd; padding-left: 28px; }
	.release { display: grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 20px; align-items: baseline; padding: 8px 0; }
	.detail { margin: 5px 0 0; font: 18px/1.45 Arial, sans-serif; color: #655c6d; overflow-wrap: anywhere; }
	.track { font-size: 16px; }
	strong { font-size: 30px; line-height: 1.3; overflow-wrap: anywhere; }
	time { text-align: right; white-space: nowrap; font-size: 23px; color: #514659; }
	.empty { padding: 48px 0; font-size: 28px; }
	footer { border-top: 1px solid #bdb0c7; padding-top: 20px; color: #655c6d; font: 16px/1.7 Arial, sans-serif; }
	</style></head><body><header><h1>K-POP COMEBACKS</h1>
	<div class="meta"><span>UPCOMING · ${upcoming.length} RELEASES</span><span class="badge">PACIFIC TIME · PST / PDT</span></div>
	</header><main>${sections || '<p class="empty">No upcoming releases announced.</p>'}</main>
	<footer>Source: K-pop Comeback Feed / Kpop Official<br>${upcoming.some((item) => item.unixDate === null) ? 'Time TBA: original announced date shown; Pacific date cannot be determined yet.<br>' : ''}As of ${escapeHtml(dateFormat.format(now))} · Schedule subject to change</footer>
	</body></html>`;
}
