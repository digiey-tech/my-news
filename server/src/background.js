// Background resources: Wikipedia articles chosen automatically from story text.
//
// Method (see README "Background resources"):
//   1. Collect capitalized phrases (people, places, organizations) from member
//      titles and excerpts. Rank them by how many articles mention them,
//      preferring multi-word phrases. Keep phrases mentioned by at least two
//      articles (or appearing in the title of a single-article story).
//   2. Search Wikipedia for each phrase. Accept a page only if every word of
//      its title occurs in the story text (so "Ebola" can match the page
//      "Ebola", but "Jackson" will not match "Michael Jackson" unless
//      "Michael" appears) and it is not a disambiguation page.
//   3. Keep at most two resources per story. When nothing passes, the API
//      reports "No background resource available".
import { USER_AGENT } from "./config.js";
import { sha1 } from "./rss.js";
import { entityPhrases, entityTokens, stem, tokenize } from "./text.js";

const MAX_LINKS = 2;
const MAX_QUERIES = 4;

export function candidateTerms(articles) {
  const storyText = articles.map((article) => `${article.title}. ${article.excerpt ?? ""}`).join(" ");
  const names = entityTokens(storyText);
  const counts = new Map();
  for (const article of articles) {
    const phrases = new Set(entityPhrases(`${article.title}. ${article.excerpt ?? ""}`).map((p) => p.replace(/[’']s$/, "")));
    for (const phrase of phrases) {
      const key = phrase.toLowerCase();
      const entry = counts.get(key) ?? { phrase, count: 0, inTitle: false };
      entry.count += 1;
      if (article.title.includes(phrase)) entry.inTitle = true;
      counts.set(key, entry);
    }
  }
  const minCount = articles.length >= 2 ? 2 : 1;
  const entries = [...counts.values()];
  const multiWord = entries.filter((entry) => entry.phrase.includes(" ")).map((entry) => entry.phrase.toLowerCase());
  return entries
    .filter((entry) => entry.count >= minCount && (articles.length >= 2 || entry.inTitle))
    .filter((entry) => entry.phrase.length >= 4 || /^[A-Z]{2,}$/.test(entry.phrase))
    .filter((entry) => {
      if (entry.phrase.includes(" ")) return true;
      const word = entry.phrase.toLowerCase();
      // A single word must be a real name (capitalized mid-sentence, not just
      // the first word of a headline) and not part of a longer name we have.
      return names.has(stem(word)) && !multiWord.some((phrase) => phrase.split(" ").includes(word));
    })
    .sort((a, b) =>
      b.count - a.count ||
      Number(b.inTitle) - Number(a.inTitle) ||
      b.phrase.split(" ").length - a.phrase.split(" ").length)
    .slice(0, MAX_QUERIES)
    .map((entry) => entry.phrase);
}

// A Wikipedia page is accepted only when its title is clearly about the term:
//  - titles must start with a letter (no "$Trump" or "NFL+"-style variants);
//  - every title word, including a qualifier such as "(Brazil)", must occur in
//    the story text;
//  - for a single-word term the title must be exactly that word, and an
//    acronym such as "ICE" must match in capitals (so it never links "Ice").
export function isRelevantTitle(pageTitle, storyText, term = "") {
  if (!/^[A-Za-z]/.test(pageTitle) || /[^A-Za-z0-9 ().,'’-]/.test(pageTitle)) return false;
  const titleWords = tokenize(pageTitle);
  if (titleWords.length === 0) return false;
  const storyWords = new Set(tokenize(storyText));
  if (!titleWords.every((word) => storyWords.has(word))) return false;
  if (term && !term.includes(" ")) {
    const base = pageTitle.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (/^[A-Z]{2,}$/.test(term)) return base === term;
    // Exact ("Florida"), or a longer name containing the word ("Donald Trump").
    return base.toLowerCase().split(/\s+/).includes(term.toLowerCase());
  }
  return true;
}

async function getJson(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function findBackground(articles, { fetchImpl = fetch } = {}) {
  const storyText = articles.map((article) => `${article.title} ${article.excerpt ?? ""}`).join(" ");
  const found = [];
  const seen = new Set();

  for (const term of candidateTerms(articles)) {
    if (found.length >= MAX_LINKS) break;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srprop=&srsearch=${encodeURIComponent(term)}`;
    const search = await getJson(searchUrl, fetchImpl);
    for (const hit of search?.query?.search ?? []) {
      if (seen.has(hit.title) || !isRelevantTitle(hit.title, storyText, term)) continue;
      seen.add(hit.title);
      const summary = await getJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
        fetchImpl
      ).catch(() => null);
      if (!summary || summary.type === "disambiguation") continue;
      const url = summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`;
      found.push({
        id: sha1(url),
        title: summary.title ?? hit.title,
        description: summary.description ?? null,
        url,
        source: "Wikipedia",
        matchedTerm: term
      });
      break;
    }
  }
  return found;
}
