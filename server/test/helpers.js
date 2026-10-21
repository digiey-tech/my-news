import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.js";
import { parseFeed } from "../src/rss.js";
import { validateAnalysis } from "../src/ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = JSON.parse(fs.readFileSync(path.join(here, "..", "fixtures", "grouping_fixture.json"), "utf8"));

export const T0 = new Date("2026-10-20T12:00:00.000Z");

export function makeClock(start = T0) {
  let current = new Date(start);
  const now = () => new Date(current);
  now.advanceHours = (hours) => {
    current = new Date(current.getTime() + hours * 3_600_000);
  };
  now.set = (date) => {
    current = new Date(date);
  };
  return now;
}

function escapeXml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Builds an RSS document per publisher so tests exercise the real parser.
export function rssFor(items) {
  const body = items.map((item) => `<item>
  <title>${escapeXml(item.title)}</title>
  <link>${escapeXml(item.url)}</link>
  <description>${escapeXml(item.excerpt ?? "")}</description>
  ${item.pubDate === null ? "" : `<pubDate>${item.pubDate}</pubDate>`}
</item>`).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>fixture</title>${body}</channel></rss>`;
}

// A mutable fake news world: feeds() returns feed configs, fetchFeed parses
// the publisher's current item list. Items can be added, removed, or broken.
export function makeWorld(articles = fixture.articles, base = T0) {
  const items = new Map();
  for (const article of articles) {
    if (!items.has(article.publisher)) items.set(article.publisher, []);
    items.get(article.publisher).push({
      ...article,
      pubDate: article.pubDate !== undefined ? article.pubDate : new Date(base.getTime() - article.hours_ago * 3_600_000).toUTCString()
    });
  }
  const broken = new Set();
  const feeds = () => [...items.keys()].map((publisher) => ({ publisher, url: `https://fixture.example/feed/${encodeURIComponent(publisher)}` }));
  const fetchFeed = async (feed, { nowIso } = {}) => {
    if (broken.has(feed.publisher)) throw new Error("HTTP 503");
    return parseFeed(rssFor(items.get(feed.publisher)), feed, nowIso);
  };
  return { items, broken, feeds, fetchFeed };
}

// Deterministic stand-in for the model that counts calls.
export function makeFakeAi() {
  const ai = {
    calls: 0,
    fail: false,
    async generateAnalysis(headline, articles) {
      ai.calls += 1;
      if (ai.fail) throw new Error("AI provider unavailable (HTTP 529 overloaded)");
      if (ai.rateLimited) throw Object.assign(new Error("AI rate limit or quota reached (HTTP 429)"), { outcome: "rate_limited" });
      const raw = {
        overview: `Fake overview of ${articles.length} article(s): ${headline}`,
        overview_refs: articles.map((_, i) => i + 1),
        agreement: "Sources agree on the basic event.",
        agreement_refs: [1],
        disagreement: "No meaningful disagreement in the available coverage.",
        disagreement_refs: [],
        uncertainty: "Costs are not established.",
        perspectives_status: articles.length >= 2 ? "supported" : "insufficient_evidence",
        perspectives: articles.length >= 2
          ? [
            { name: "Supporters", summary: "Supporters back it.", evidence_limits: "Excerpts only.", refs: [1] },
            { name: "Critics", summary: "Critics question cost.", evidence_limits: "Excerpts only.", refs: [articles.length, 99] }
          ]
          : []
      };
      return { analysis: validateAnalysis(raw, articles), usage: { input_tokens: 10, output_tokens: 10 }, model: "fake-model" };
    }
  };
  return ai;
}

export async function setup({ articles, clock = makeClock() } = {}) {
  const db = await openDb({ databaseUrl: "", sqlitePath: ":memory:" });
  const world = makeWorld(articles);
  const ai = makeFakeAi();
  const deps = {
    get feeds() {
      return world.feeds();
    },
    fetchFeed: world.fetchFeed,
    findBackground: async (members) => (members.some((a) => /Riverton/.test(a.title))
      ? [{ id: "bg1", title: "Riverton Transit Authority", description: "Fixture background", url: "https://fixture.example/wiki/Riverton_Transit", source: "Wikipedia", matchedTerm: "Riverton" }]
      : []),
    generateAnalysis: ai.generateAnalysis
  };
  return { db, world, ai, deps, clock };
}

export function refIdMap(db) {
  return db.all("SELECT id, url, story_id FROM articles").then((rows) => {
    const byUrl = new Map(rows.map((row) => [row.url, row]));
    const map = new Map();
    for (const article of fixture.articles) {
      const row = byUrl.get(article.url);
      if (row) map.set(article.ref, row);
    }
    return map;
  });
}
