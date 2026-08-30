import { Comeback } from './scraper';
import RSS from "rss";

export function comebacksToRss(comebacks: Comeback[]): string {
  const feed = new RSS({
    title: "K-Pop Comebacks",
    description: "Upcoming K-Pop comebacks and releases from kpopofficial.com",
    site_url: "https://kpopofficial.com/kpop-comebacks",
    language: "en",
    pubDate: new Date(),
  });

  for (const comeback of comebacks) {
    feed.item({
      title: comeback.artist,
      description: `
        <p><strong>${comeback.artist}</strong></p>
        <p>Release: ${comeback.dateTime}</p>
        ${
          comeback.image
            ? `<img src="${comeback.image}" alt="${comeback.artist}" />`
            : ""
        }
      `,
      url: comeback.url,
      guid: comeback.url,
      date: comeback.unixDate ? new Date(comeback.unixDate * 1000) : undefined,
    });
  }

  return feed.xml({ indent: true });
}
