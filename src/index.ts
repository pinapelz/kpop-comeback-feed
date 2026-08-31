import { Hono } from 'hono';
import { scrapeComeback } from './scraper';
import { comebacksToRss } from './rss';

const app = new Hono();

app.get('/rss', async (c) => {
	const comebacks = await scrapeComeback();
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
	if(format === "json")
		return c.json(todayComebacks);
	else{
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
