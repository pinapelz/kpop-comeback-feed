# kpop-comeback-feed
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pinapelz/kpop-comeback-feed)

A Cloudflare Worker app that scrapes https://kpopofficial.com/kpop-comebacks/ into JSON and RSS format.

## Routes
- `/rss`: RSS feed of all comebacks
	- `allowFuture=true|false`: false by default, when true only include comebacks that have already passed (no future dates allowed)
- `/api/comebacks`: Same information as RSS feed, but as a JSON instead
- `/api/today`: Returns only comebacks that occur TODAY
	- `format=json|plaintext`: By default returns in JSON form, plaintext mode reduces to only group and formatted date info

By default all scraped results are cached for 2 hours, crawling happens only when endpoints are invoked.
