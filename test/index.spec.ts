import { describe, it, expect } from "vitest";
import { parseKstDateToUnix, type Comeback } from "../src/scraper";
import { comebacksToRss } from "../src/rss";


describe("parseKstDateToUnix", () => {
	it("parses a full date with 12-hour time", () => {
		// January 15, 2025 6:00 PM KST is 2025-01-15 09:00 UTC = 1736926800 (approx)
		const unix = parseKstDateToUnix("January 15, 2025 6:00 PM");
		expect(unix).toBe(new Date("2025-01-15T09:00:00Z").getTime() / 1000);
	});

	it("parses a date with an ordinal suffix", () => {
		const unix = parseKstDateToUnix("March 3rd, 2025 12:00 AM");
		expect(unix).toBe(new Date("2025-03-02T15:00:00Z").getTime() / 1000);
	});

	it("parses 12 PM (noon) correctly", () => {
		const unix = parseKstDateToUnix("June 1, 2025 12:00 PM");
		expect(unix).toBe(new Date("2025-06-01T03:00:00Z").getTime() / 1000);
	});

	it("parses 12 AM (midnight) correctly", () => {
		const unix = parseKstDateToUnix("June 2, 2025 12:00 AM");
		expect(unix).toBe(new Date("2025-06-01T15:00:00Z").getTime() / 1000);
	});

	it("handles a missing minute component", () => {
		const unix = parseKstDateToUnix("February 10, 2025 9 PM");
		expect(unix).toBe(new Date("2025-02-10T12:00:00Z").getTime() / 1000);
	});

	it("returns null for an empty string", () => {
		expect(parseKstDateToUnix("")).toBeNull();
	});

	it("returns null for an invalid date string", () => {
		expect(parseKstDateToUnix("not a date")).toBeNull();
	});

	it("returns null when the date is missing a time", () => {
		expect(parseKstDateToUnix("January 15, 2025")).toBeNull();
	});
});

describe("comebacksToRss", () => {
	const comebacks: Comeback[] = [
		{
			artist: "NewJeans",
			dateTime: "January 15, 2025 6:00 PM",
			image: "https://example.com/art.jpg",
			url: "https://kpopofficial.com/comeback/newjeans",
			unixDate: 1736930400,
		},
		{
			artist: "BTS",
			dateTime: "February 1, 2025 12:00 AM",
			image: null,
			url: "https://kpopofficial.com/comeback/bts",
			unixDate: null,
		},
	];

	it("produces a valid RSS 2.0 document with channel metadata", () => {
		const xml = comebacksToRss(comebacks);
		expect(xml).toContain("<rss");
		expect(xml).toContain("<channel>");
		expect(xml).toContain("K-Pop Comebacks");
		expect(xml).toContain("<![CDATA[en]]></language>");
		expect(xml).toContain("kpopofficial.com/kpop-comebacks");
	});

	it("adds an item per comeback", () => {
		const xml = comebacksToRss(comebacks);

		expect(xml.match(/<item>/g)).toHaveLength(comebacks.length);
		expect(xml).toContain("NewJeans");
		expect(xml).toContain("BTS");
		expect(xml).toContain("https://kpopofficial.com/comeback/newjeans");
	});

	it("includes the release date when a unixDate is present", () => {
		const xml = comebacksToRss([comebacks[0]]);
		expect(xml).toContain("January 15, 2025");
	});

	it("embeds the image when present and omits it when absent", () => {
		const withImage = comebacksToRss([comebacks[0]]);
		expect(withImage).toContain('src="https://example.com/art.jpg"');

		const withoutImage = comebacksToRss([comebacks[1]]);
		expect(withoutImage).not.toContain("<img");
	});

	it("returns an empty channel for no comebacks", () => {
		const xml = comebacksToRss([]);
		expect(xml).toContain("<channel>");
		expect(xml).not.toContain("<item>");
	});
});
