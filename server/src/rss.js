// Fetches RSS/Atom feeds and turns items into normalized article records.
import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { config, USER_AGENT } from "./config.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: false,
  // Entities are decoded by cleanText(); the parser's own expansion has a
  // hard limit that large feeds (Fox News, The Guardian) exceed.
  processEntities: false
});

const TRACKING_PARAMS = /^(utm_|at_|fbclid$|gclid$|ocid$|cmpid$|ftag$|taid$|partner$|cmp$|src$|ref$|intcmp$|CMP$)/i;

export function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

// Canonical form of an article URL used as the duplicate-prevention key.
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl).trim());
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    let text = url.toString();
    if (text.endsWith("/") && url.pathname !== "/") text = text.slice(0, -1);
    return text;
  } catch {
    return String(rawUrl || "").trim().toLowerCase();
  }
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === "object") return textOf(value["#text"] ?? value["@href"] ?? "");
  return "";
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "...", mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

// Feeds sometimes escape their HTML twice, so decode and strip until stable.
export function cleanText(html) {
  let text = String(html || "");
  for (let i = 0; i < 3; i++) {
    const next = stripTags(decodeEntities(text));
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/\b(Sign up for|Get our)\b[^.]*?\b(email|app|podcast|newsletter)s?\b[^.]*\.?/gi, "")
    .replace(/\b(Continue reading|Read more)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { publishedAt, source } where source explains how the date was chosen.
// Missing, unparseable, or far-future dates fall back to the first time we saw
// the article ("first_seen"), so they still expire seven days later.
export function resolvePublishedAt(rawDate, firstSeenAt) {
  const parsed = rawDate ? new Date(rawDate) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { publishedAt: firstSeenAt, source: "first_seen" };
  }
  const limit = new Date(firstSeenAt).getTime() + config.futureToleranceMinutes * 60_000;
  if (parsed.getTime() > limit) {
    return { publishedAt: firstSeenAt, source: "first_seen" };
  }
  return { publishedAt: parsed.toISOString(), source: "feed" };
}

function stripPublisherSuffix(title) {
  return title.replace(/\s+[-|]\s+(BBC News|Fox News|NPR|The Guardian|Al Jazeera|CBS News)$/i, "").trim();
}

export function parseFeed(xmlText, feed, nowIso = new Date().toISOString()) {
  const doc = parser.parse(xmlText);
  const rssItems = doc?.rss?.channel?.item ?? doc?.["rdf:RDF"]?.item;
  const atomEntries = doc?.feed?.entry;
  const items = [rssItems, atomEntries].find(Boolean);
  if (!items) throw new Error("Feed contained no items");
  const list = Array.isArray(items) ? items : [items];

  const articles = [];
  for (const item of list) {
    let link = textOf(item.link);
    if (Array.isArray(item.link)) {
      const alternate = item.link.find((entry) => entry?.["@rel"] === "alternate") ?? item.link[0];
      link = textOf(alternate);
    }
    if (!link && typeof item.guid === "object" && item.guid?.["@isPermaLink"] !== "false") link = textOf(item.guid);
    if (!link && typeof item.guid === "string" && /^https?:/.test(item.guid)) link = item.guid;
    link = cleanText(link);
    const title = stripPublisherSuffix(cleanText(textOf(item.title)));
    if (!link || !title) continue;

    const excerpt = cleanText(textOf(item.description ?? item.summary ?? item["media:description"] ?? item.content)).slice(0, 1200);
    const rawDate = textOf(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]);
    const { publishedAt, source } = resolvePublishedAt(rawDate, nowIso);
    const normalizedUrl = normalizeUrl(link);

    articles.push({
      id: sha1(normalizedUrl),
      publisher: feed.publisher,
      feedUrl: feed.url,
      url: link.trim(),
      normalizedUrl,
      title,
      excerpt,
      publishedAt,
      publishedAtSource: source,
      contentHash: sha1(`${title}\n${excerpt}`)
    });
  }
  return articles;
}

export async function fetchFeed(feed, { fetchImpl = fetch, nowIso } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.feedTimeoutMs);
  try {
    const response = await fetchImpl(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseFeed(await response.text(), feed, nowIso);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Timed out after ${config.feedTimeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
