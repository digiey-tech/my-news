// Fetches the live feeds (without touching the database) and prints the story
// groups the grouping algorithm would produce. Useful for tuning and for the
// grouping examples in the verification evidence.
//   node scripts/grouping-report.js [--pairs]
import { FEEDS } from "../src/feeds.js";
import { fetchFeed } from "../src/rss.js";
import { assignStories, buildIndex, compare } from "../src/grouping.js";

const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
const byId = new Map();
results.forEach((result, i) => {
  if (result.status === "fulfilled") {
    console.log(`OK   ${FEEDS[i].publisher.padEnd(13)} ${result.value.length} items`);
    for (const article of result.value) byId.set(article.id, article);
  } else {
    console.log(`FAIL ${FEEDS[i].publisher.padEnd(13)} ${result.reason.message}`);
  }
});

const cutoff = Date.now() - 168 * 3_600_000;
const articles = [...byId.values()].filter((a) => new Date(a.publishedAt).getTime() >= cutoff);
const assignment = assignStories([], articles);
const groups = new Map();
for (const article of articles) {
  const { storyId } = assignment.get(article.id);
  if (!groups.has(storyId)) groups.set(storyId, []);
  groups.get(storyId).push(article);
}
const index = buildIndex(articles);
const multi = [...groups.values()]
  .filter((members) => new Set(members.map((a) => a.publisher)).size >= 2)
  .sort((x, y) => y.length - x.length);

console.log(`\n${articles.length} articles -> ${groups.size} stories, ${multi.length} with 2+ publishers\n`);
for (const members of multi) {
  console.log(`[${new Set(members.map((a) => a.publisher)).size} publishers]`);
  for (const a of members) {
    const info = assignment.get(a.id);
    const why = info.matchedWith ? compare(index, a.id, info.matchedWith) : null;
    const reason = why ? ` (cos=${why.cosine.toFixed(2)} ent=[${why.sharedEntities.join(',')}] event=[${why.eventTerms.join(',')}])` : '';
    console.log(`   ${a.publisher.padEnd(13)} ${a.publishedAt.slice(0, 16)}  ${a.title}${reason}`);
  }
}

if (process.argv.includes("--pairs")) {
  // Near misses: cross-publisher pairs that were close but not merged.
  const near = [];
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];
      if (a.publisher === b.publisher) continue;
      if (assignment.get(a.id).storyId === assignment.get(b.id).storyId) continue;
      const v = compare(index, a.id, b.id);
      if (v.cosine >= 0.12 && v.sharedEntities.length >= 1) near.push({ a, b, v });
    }
  }
  near.sort((x, y) => y.v.cosine - x.v.cosine);
  console.log(`\nNear misses (${near.length}):`);
  for (const { a, b, v } of near.slice(0, 40)) {
    console.log(`  cos=${v.cosine.toFixed(2)} ent=[${v.sharedEntities.join(",")}] terms=${v.sharedTerms.length}`);
    console.log(`     ${a.publisher}: ${a.title}`);
    console.log(`     ${b.publisher}: ${b.title}`);
  }
}
