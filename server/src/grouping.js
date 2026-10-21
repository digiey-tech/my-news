// Story grouping: decides which articles describe the same event.
//
// Method (see README "Grouping method"):
//   1. Each article becomes a TF-IDF vector of its title (counted twice) and
//      feed excerpt, after stop-word removal and light stemming.
//   2. Entity tokens are collected from capitalized phrases (people, places,
//      organizations).
//   3. Two articles match only if they were published within 48 hours of each
//      other AND share at least two distinctive terms AND either
//        - cosine similarity >= STRONG_COSINE, or
//        - cosine similarity >= WEAK_COSINE and they share >= 2 entity tokens.
//      One shared keyword (e.g. only "Trump") is never enough.
//   4. Articles already in a story keep their story. Each new article (oldest
//      first) joins the story containing its best match; otherwise it founds a
//      new single-source story whose ID derives from that article's ID.
import { sha1 } from "./rss.js";
import { entityTokens, isGenericWord, tokenize } from "./text.js";

export const VERY_STRONG_COSINE = 0.5;
export const STRONG_COSINE = 0.32;
export const WEAK_COSINE = 0.2;
export const MIN_SHARED_TERMS = 2;
export const MIN_SHARED_ENTITIES = 2;
export const CENTROID_MIN = 0.22;

// Multi-topic digests (newsletters, front-page reviews, live blogs, daily
// shows) cover many events at once, so they always stay single-article stories.
const ROUNDUP_TITLE = /(news brief|the papers|^\d{1,2}\/\d{1,2}:|takeout with|week in review|live:|live updates|newsletter|briefing|morning edition|evening news)/i;

export function storyIdFor(articleId) {
  return `st_${sha1(`story:${articleId}`).slice(0, 16)}`;
}

function featuresOf(article) {
  const titleTokens = tokenize(article.title);
  const bodyTokens = tokenize(article.excerpt);
  const counts = new Map();
  for (const token of [...titleTokens, ...titleTokens, ...bodyTokens]) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return {
    counts,
    roundup: ROUNDUP_TITLE.test(article.title),
    entities: entityTokens(`${article.title}. ${article.excerpt ?? ""}`),
    time: new Date(article.publishedAt).getTime()
  };
}

export function buildIndex(articles) {
  const features = new Map();
  const documentFrequency = new Map();
  for (const article of articles) {
    const feature = featuresOf(article);
    features.set(article.id, feature);
    for (const token of feature.counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = articles.length;
  const idf = (token) => Math.log((total + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1;

  for (const feature of features.values()) {
    const vector = new Map();
    let norm = 0;
    for (const [token, count] of feature.counts) {
      const weight = (1 + Math.log(count)) * idf(token);
      vector.set(token, weight);
      norm += weight * weight;
    }
    feature.vector = vector;
    feature.norm = Math.sqrt(norm) || 1;
  }
  return { features, idf, total };
}

export function compare(index, idA, idB, windowHours = 48) {
  const a = index.features.get(idA);
  const b = index.features.get(idB);
  const hoursApart = Math.abs(a.time - b.time) / 3_600_000;

  let dot = 0;
  const sharedTerms = [];
  const [small, large] = a.vector.size <= b.vector.size ? [a.vector, b.vector] : [b.vector, a.vector];
  for (const [token, weight] of small) {
    const other = large.get(token);
    if (other) {
      dot += weight * other;
      // Distinctive = not present in a large share of the corpus. A small
      // corpus (first runs, tests) has no reliable frequencies, so all count.
      if (index.total < 20 || index.idf(token) > 1.5) sharedTerms.push(token);
    }
  }
  const cosine = dot / (a.norm * b.norm);
  const sharedEntities = [...a.entities].filter((token) => b.entities.has(token));
  // Shared words that are not names: what happened (merger, arrest, tariff...).
  // Sharing only names is how unrelated events about one person get merged.
  const eventTerms = sharedTerms.filter((token) => !a.entities.has(token) && !b.entities.has(token) && !isGenericWord(token));

  const withinWindow = hoursApart <= windowHours;
  const enoughTerms = sharedTerms.length >= MIN_SHARED_TERMS;
  const roundup = a.roundup || b.roundup;
  // Both name people/places but none in common: likely the same kind of event
  // in different places (two wildfires), not the same event.
  const entityConflict = a.entities.size > 0 && b.entities.size > 0 && sharedEntities.length === 0;
  const match = withinWindow && enoughTerms && !roundup && (
    cosine >= VERY_STRONG_COSINE ||
    (eventTerms.length >= 1 && cosine >= STRONG_COSINE && !entityConflict) ||
    (eventTerms.length >= 1 && cosine >= WEAK_COSINE && sharedEntities.length >= MIN_SHARED_ENTITIES)
  );

  return { match, cosine, sharedTerms, sharedEntities, eventTerms, hoursApart };
}

// Cosine between one article and the mean of a story's (unit) member vectors.
export function centroidCosine(index, articleId, memberIds) {
  const centroid = new Map();
  for (const id of memberIds) {
    const feature = index.features.get(id);
    for (const [token, weight] of feature.vector) {
      centroid.set(token, (centroid.get(token) ?? 0) + weight / feature.norm);
    }
  }
  let norm = 0;
  for (const weight of centroid.values()) norm += weight * weight;
  const article = index.features.get(articleId);
  let dot = 0;
  for (const [token, weight] of article.vector) dot += weight * (centroid.get(token) ?? 0);
  return dot / ((Math.sqrt(norm) || 1) * article.norm);
}

// assigned: active articles that already belong to a story (must have storyId).
// unassigned: articles that need a story.
// Returns Map(articleId -> { storyId, created, matchedWith, score }).
export function assignStories(assigned, unassigned, { windowHours = 48 } = {}) {
  const all = [...assigned, ...unassigned];
  const index = buildIndex(all);
  const members = assigned.map((article) => ({ id: article.id, storyId: article.storyId }));
  const result = new Map();

  const ordered = [...unassigned].sort((x, y) => x.publishedAt.localeCompare(y.publishedAt) || x.id.localeCompare(y.id));
  for (const article of ordered) {
    // Best matching member per candidate story.
    const candidates = new Map();
    for (const member of members) {
      const verdict = compare(index, article.id, member.id, windowHours);
      const current = candidates.get(member.storyId);
      if (verdict.match && (!current || verdict.cosine > current.score)) {
        candidates.set(member.storyId, { storyId: member.storyId, matchedWith: member.id, score: verdict.cosine });
      }
    }
    // Guard against chaining (A~B, B~C, but A and C are different events): the
    // article must also resemble the story as a whole, not only one member.
    let best = null;
    for (const candidate of candidates.values()) {
      const storyMembers = members.filter((member) => member.storyId === candidate.storyId).map((member) => member.id);
      if (storyMembers.length >= 2 && centroidCosine(index, article.id, storyMembers) < CENTROID_MIN) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) {
      result.set(article.id, { ...best, created: false });
      members.push({ id: article.id, storyId: best.storyId });
    } else {
      const storyId = storyIdFor(article.id);
      result.set(article.id, { storyId, created: true, matchedWith: null, score: 0 });
      members.push({ id: article.id, storyId });
    }
  }
  return result;
}

// Chooses the most representative title as the story headline and the top terms.
export function describeStory(articles) {
  if (articles.length === 1) {
    return { headline: articles[0].title, keywords: [...new Set(tokenize(articles[0].title))].slice(0, 6) };
  }
  const index = buildIndex(articles);
  let bestArticle = articles[0];
  let bestScore = -1;
  for (const article of articles) {
    let score = 0;
    for (const other of articles) {
      if (other.id !== article.id) score += compare(index, article.id, other.id, Infinity).cosine;
    }
    if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && article.publishedAt < bestArticle.publishedAt)) {
      bestScore = score;
      bestArticle = article;
    }
  }
  const termWeights = new Map();
  for (const feature of index.features.values()) {
    for (const [token, weight] of feature.vector) termWeights.set(token, (termWeights.get(token) ?? 0) + weight);
  }
  const keywords = [...termWeights.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([token]) => token);
  return { headline: bestArticle.title, keywords };
}

export function storyInputHash(articles) {
  return sha1(articles.map((article) => `${article.id}:${article.contentHash}`).sort().join("|"));
}
