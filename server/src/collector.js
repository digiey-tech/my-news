// The scheduled worker. One call = one collection run:
//   fetch feeds -> upsert articles -> retention cleanup -> grouping ->
//   story metadata -> background links -> AI summaries -> job record.
// Every stage is isolated so that one failing feed, Wikipedia lookup, or AI
// call never aborts the run or deletes still-valid data.
import crypto from "node:crypto";
import { config } from "./config.js";
import { FEEDS } from "./feeds.js";
import { fetchFeed } from "./rss.js";
import { assignStories, describeStory, storyInputHash } from "./grouping.js";
import { findBackground } from "./background.js";
import { generateAnalysis, INPUT_SCOPE } from "./ai.js";

const HOUR = 3_600_000;
const LOCK_MINUTES = 30;
const FAILED_SUMMARY_RETRY_HOURS = 3;

export function cutoffIso(now = new Date()) {
  return new Date(now.getTime() - config.retentionHours * HOUR).toISOString();
}

export function rowToArticle(row) {
  return {
    id: row.id,
    publisher: row.publisher,
    feedUrl: row.feed_url,
    url: row.url,
    normalizedUrl: row.normalized_url,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.published_at,
    publishedAtSource: row.published_at_source,
    contentHash: row.content_hash,
    storyId: row.story_id
  };
}

const defaultDeps = { feeds: FEEDS, fetchFeed, findBackground, generateAnalysis };

export async function runCollection(db, { trigger = "cli", now = () => new Date(), deps = {} } = {}) {
  const d = { ...defaultDeps, ...deps };
  const startedAt = now().toISOString();

  const running = await db.get(
    "SELECT id, started_at FROM job_runs WHERE status = 'running' AND started_at > $1 ORDER BY started_at DESC",
    [new Date(now().getTime() - LOCK_MINUTES * 60_000).toISOString()]
  );
  if (running) return { skipped: true, reason: `Run ${running.id} started at ${running.started_at} is still in progress` };

  const job = {
    id: `job_${startedAt.replace(/[-:.TZ]/g, "")}_${crypto.randomBytes(3).toString("hex")}`,
    trigger, startedAt, feeds_ok: 0, feeds_failed: 0, articles_fetched: 0, articles_new: 0, articles_updated: 0,
    articles_expired: 0, stories_created: 0, stories_removed: 0, summaries_generated: 0, summaries_failed: 0,
    summaries_invalidated: 0, background_links: 0, notes: []
  };
  await db.run("INSERT INTO job_runs (id, trigger, started_at, status) VALUES ($1, $2, $3, 'running')", [job.id, trigger, startedAt]);

  let fatal = null;
  try {
    await collectFeeds(db, job, d, now);
    Object.assign(job, await applyRetention(db, now(), job));
    await groupArticles(db, job, now);
    await refreshStories(db, now);
    await attachBackground(db, job, d, now);
    await generateSummaries(db, job, d, now);
  } catch (error) {
    fatal = error;
    job.notes.push(`Run aborted: ${error.message}`);
  }

  let status = "success";
  if (fatal || job.feeds_ok === 0) status = "failed";
  else if (job.feeds_failed > 0 || job.summaries_failed > 0) status = "partial";

  await db.run(
    `UPDATE job_runs SET finished_at = $2, status = $3, feeds_ok = $4, feeds_failed = $5, articles_fetched = $6,
       articles_new = $7, articles_updated = $8, articles_expired = $9, stories_created = $10, stories_removed = $11,
       summaries_generated = $12, summaries_failed = $13, summaries_invalidated = $14, background_links = $15, notes = $16
     WHERE id = $1`,
    [job.id, now().toISOString(), status, job.feeds_ok, job.feeds_failed, job.articles_fetched, job.articles_new,
      job.articles_updated, job.articles_expired, job.stories_created, job.stories_removed, job.summaries_generated,
      job.summaries_failed, job.summaries_invalidated, job.background_links, JSON.stringify(job.notes.slice(0, 50))]
  );
  return { ...job, status, finishedAt: now().toISOString() };
}

async function collectFeeds(db, job, d, now) {
  const fetchedAt = now().toISOString();
  const results = await Promise.allSettled(d.feeds.map((feed) => d.fetchFeed(feed, { nowIso: fetchedAt })));
  const cutoff = cutoffIso(now());
  // The same link can appear in two feeds of one publisher (BBC top stories and
  // BBC world) with slightly different text. Keep the first copy per run so
  // its content hash does not flip and trigger needless AI regeneration.
  const seenThisRun = new Set();

  for (const [i, result] of results.entries()) {
    const feed = d.feeds[i];
    if (result.status === "fulfilled") {
      job.feeds_ok += 1;
      await db.run(
        `INSERT INTO feed_status (feed_url, publisher, last_attempt_at, last_success_at, last_error, last_item_count)
         VALUES ($1, $2, $3, $3, NULL, $4)
         ON CONFLICT (feed_url) DO UPDATE SET publisher = $2, last_attempt_at = $3, last_success_at = $3, last_error = NULL, last_item_count = $4`,
        [feed.url, feed.publisher, fetchedAt, result.value.length]
      );
      await db.tx(async (tx) => {
        for (const article of result.value) {
          if (article.publishedAt < cutoff || seenThisRun.has(article.id)) continue;
          seenThisRun.add(article.id);
          job.articles_fetched += 1;
          await upsertArticle(tx, article, fetchedAt, job);
        }
      });
    } else {
      job.feeds_failed += 1;
      const message = String(result.reason?.message ?? result.reason).slice(0, 300);
      job.notes.push(`Feed failed: ${feed.publisher} (${feed.url}): ${message}`);
      await db.run(
        `INSERT INTO feed_status (feed_url, publisher, last_attempt_at, last_error)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (feed_url) DO UPDATE SET publisher = $2, last_attempt_at = $3, last_error = $4`,
        [feed.url, feed.publisher, fetchedAt, message]
      );
    }
  }
}

// Duplicate prevention: the article id is a hash of the normalized URL, so
// re-fetching the same link updates the existing row instead of adding one.
export async function upsertArticle(db, article, seenAt, job) {
  const existing = await db.get("SELECT id, content_hash, published_at, published_at_source FROM articles WHERE id = $1", [article.id]);
  if (!existing) {
    await db.run(
      `INSERT INTO articles (id, publisher, feed_url, url, normalized_url, title, excerpt, published_at, published_at_source,
         first_seen_at, last_seen_at, content_hash, story_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [article.id, article.publisher, article.feedUrl, article.url, article.normalizedUrl, article.title, article.excerpt,
        article.publishedAt, article.publishedAtSource, seenAt, article.contentHash]
    );
    if (job) job.articles_new += 1;
    return "new";
  }

  // A missing/invalid date keeps the first-seen time from the first fetch,
  // otherwise the article would never expire. A valid feed date wins.
  let publishedAt = existing.published_at;
  let source = existing.published_at_source;
  if (article.publishedAtSource === "feed") {
    publishedAt = article.publishedAt;
    source = "feed";
  }
  const changed = existing.content_hash !== article.contentHash || publishedAt !== existing.published_at;
  await db.run(
    `UPDATE articles SET title = $2, excerpt = $3, url = $4, published_at = $5, published_at_source = $6,
       last_seen_at = $7, content_hash = $8 WHERE id = $1`,
    [article.id, article.title, article.excerpt, article.url, publishedAt, source, seenAt, article.contentHash]
  );
  if (changed && job) job.articles_updated += 1;
  return changed ? "updated" : "unchanged";
}

// Seven-day retention by publication time, plus consistent cleanup of
// everything that depended on the removed articles.
export async function applyRetention(db, now = new Date(), job = null) {
  const cutoff = cutoffIso(now);
  const result = { articles_expired: 0, stories_removed: 0, summaries_invalidated: 0 };

  await db.tx(async (tx) => {
    result.articles_expired = (await tx.run("DELETE FROM articles WHERE published_at < $1", [cutoff])).changes;

    // Summaries that cite an article which no longer exists (or moved to
    // another story) must not be served; clear them so they are regenerated.
    const summaries = await tx.all("SELECT story_id, article_ids FROM summaries WHERE payload IS NOT NULL");
    for (const summary of summaries) {
      const ids = JSON.parse(summary.article_ids || "[]");
      if (ids.length === 0) continue;
      const rows = await tx.all(
        `SELECT id FROM articles WHERE story_id = $1 AND id IN (${ids.map((_, i) => `$${i + 2}`).join(", ")})`,
        [summary.story_id, ...ids]
      );
      if (rows.length < ids.length) {
        await tx.run(
          `UPDATE summaries SET payload = NULL, input_hash = NULL, invalidated_reason = $2 WHERE story_id = $1`,
          [summary.story_id, `${ids.length - rows.length} supporting article(s) expired or were removed`]
        );
        result.summaries_invalidated += 1;
      }
    }

    result.stories_removed = (await tx.run(
      "DELETE FROM stories WHERE id NOT IN (SELECT DISTINCT story_id FROM articles WHERE story_id IS NOT NULL)"
    )).changes;
    await tx.run("DELETE FROM summaries WHERE story_id NOT IN (SELECT id FROM stories)");
    await tx.run("DELETE FROM story_background WHERE story_id NOT IN (SELECT id FROM stories)");
    // Background resources live only while linked to an active story.
    await tx.run("DELETE FROM background_resources WHERE id NOT IN (SELECT resource_id FROM story_background)");
    // AI call log keeps no text, but drop rows for stories that are gone after the window.
    await tx.run("DELETE FROM ai_calls WHERE called_at < $1 AND story_id NOT IN (SELECT id FROM stories)", [cutoff]);
  });

  if (job && result.articles_expired > 0) job.notes.push(`Retention removed ${result.articles_expired} article(s) published before ${cutoff}`);
  return result;
}

async function groupArticles(db, job, now) {
  const cutoff = cutoffIso(now());
  const rows = await db.all(
    `SELECT a.* FROM articles a WHERE a.published_at >= $1`, [cutoff]
  );
  const storyIds = new Set((await db.all("SELECT id FROM stories")).map((row) => row.id));
  const articles = rows.map(rowToArticle);
  const assigned = articles.filter((article) => article.storyId && storyIds.has(article.storyId));
  const unassigned = articles.filter((article) => !article.storyId || !storyIds.has(article.storyId));
  if (unassigned.length === 0) return;

  const assignment = assignStories(assigned, unassigned, { windowHours: config.groupingWindowHours });
  const nowIso = now().toISOString();
  await db.tx(async (tx) => {
    for (const article of unassigned) {
      const { storyId, created } = assignment.get(article.id);
      if (created && !storyIds.has(storyId)) {
        await tx.run(
          `INSERT INTO stories (id, headline, created_at, updated_at, latest_article_at, input_hash)
           VALUES ($1, $2, $3, $3, $4, '') ON CONFLICT (id) DO NOTHING`,
          [storyId, article.title, nowIso, article.publishedAt]
        );
        storyIds.add(storyId);
        job.stories_created += 1;
      }
      await tx.run("UPDATE articles SET story_id = $2 WHERE id = $1", [article.id, storyId]);
    }
  });
}

// Recomputes headline, latest time, keywords, and input hash for every story.
export async function refreshStories(db, now) {
  const cutoff = cutoffIso(now());
  const rows = await db.all("SELECT * FROM articles WHERE story_id IS NOT NULL AND published_at >= $1", [cutoff]);
  const byStory = new Map();
  for (const row of rows) {
    if (!byStory.has(row.story_id)) byStory.set(row.story_id, []);
    byStory.get(row.story_id).push(rowToArticle(row));
  }
  const stories = await db.all("SELECT id, headline, input_hash FROM stories");
  const nowIso = now().toISOString();
  await db.tx(async (tx) => {
    for (const story of stories) {
      const members = byStory.get(story.id);
      if (!members) continue;
      const { headline, keywords } = describeStory(members);
      const inputHash = storyInputHash(members);
      const latest = members.reduce((max, article) => (article.publishedAt > max ? article.publishedAt : max), members[0].publishedAt);
      if (inputHash !== story.input_hash || headline !== story.headline) {
        await tx.run(
          `UPDATE stories SET headline = $2, latest_article_at = $3, input_hash = $4, keywords = $5, updated_at = $6 WHERE id = $1`,
          [story.id, headline, latest, inputHash, JSON.stringify(keywords), nowIso]
        );
      }
    }
  });
}

async function activeStoriesWithMembers(db, now) {
  const cutoff = cutoffIso(now());
  const rows = await db.all("SELECT * FROM articles WHERE story_id IS NOT NULL AND published_at >= $1 ORDER BY published_at", [cutoff]);
  const stories = new Map((await db.all("SELECT * FROM stories")).map((story) => [story.id, { ...story, members: [] }]));
  for (const row of rows) stories.get(row.story_id)?.members.push(rowToArticle(row));
  return [...stories.values()]
    .filter((story) => story.members.length > 0)
    .map((story) => ({ ...story, publisherCount: new Set(story.members.map((a) => a.publisher)).size }))
    .sort((a, b) => b.publisherCount - a.publisherCount || b.latest_article_at.localeCompare(a.latest_article_at));
}

async function attachBackground(db, job, d, now) {
  const stories = (await activeStoriesWithMembers(db, now)).filter((story) => story.background_hash !== story.input_hash);
  let lookups = 0;
  let failures = 0;
  for (const story of stories) {
    if (lookups >= config.maxBackgroundLookupsPerRun) break;
    lookups += 1;
    try {
      const resources = await d.findBackground(story.members);
      const fetchedAt = now().toISOString();
      await db.tx(async (tx) => {
        await tx.run("DELETE FROM story_background WHERE story_id = $1", [story.id]);
        for (const [position, resource] of resources.entries()) {
          await tx.run(
            `INSERT INTO background_resources (id, title, description, url, source, fetched_at) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET title = $2, description = $3, url = $4, source = $5, fetched_at = $6`,
            [resource.id, resource.title, resource.description, resource.url, resource.source, fetchedAt]
          );
          await tx.run(
            "INSERT INTO story_background (story_id, resource_id, matched_term, position) VALUES ($1, $2, $3, $4) ON CONFLICT (story_id, resource_id) DO NOTHING",
            [story.id, resource.id, resource.matchedTerm, position]
          );
          job.background_links += 1;
        }
        await tx.run("UPDATE stories SET background_hash = $2 WHERE id = $1", [story.id, story.input_hash]);
      });
    } catch (error) {
      // Keep any previous links; try again next run.
      failures += 1;
      if (failures <= 3) job.notes.push(`Background lookup failed for ${story.id}: ${error.message}`);
    }
  }
  await db.run("DELETE FROM background_resources WHERE id NOT IN (SELECT resource_id FROM story_background)");
}

async function generateSummaries(db, job, d, now) {
  const realModel = d.generateAnalysis === generateAnalysis;
  if (realModel && !config.aiApiKey) {
    job.notes.push(`AI summaries skipped: ${config.aiApiKeyEnv} is not configured`);
    return;
  }
  const summaries = new Map((await db.all("SELECT * FROM summaries")).map((row) => [row.story_id, row]));
  const retryBefore = new Date(now().getTime() - FAILED_SUMMARY_RETRY_HOURS * HOUR).toISOString();

  const due = (await activeStoriesWithMembers(db, now)).filter((story) => {
    if (story.publisherCount < config.aiMinPublishers) return false; // quota-saving mode
    const summary = summaries.get(story.id);
    if (!summary) return true;
    if (summary.payload && summary.input_hash === story.input_hash) return false; // unchanged: reuse
    // Do not retry a failing input every hour.
    if (summary.last_attempt_ok === 0 && summary.last_attempt_input_hash === story.input_hash && summary.last_attempt_at > retryBefore) return false;
    return true;
  });

  let calls = 0;
  for (const story of due) {
    if (calls >= config.maxAiCallsPerRun) {
      job.notes.push(`${due.length - calls} story summaries deferred to a later run (MAX_AI_CALLS_PER_RUN=${config.maxAiCallsPerRun})`);
      break;
    }
    // Space out real model calls to stay under free-tier requests-per-minute limits.
    if (calls > 0 && realModel && config.aiMinIntervalMs > 0) await sleep(config.aiMinIntervalMs);
    calls += 1;
    const articles = story.members; // sorted by publication time -> stable ref numbers
    const calledAt = now().toISOString();
    const callId = `ai_${crypto.randomBytes(8).toString("hex")}`;
    try {
      const { analysis, usage, model } = await d.generateAnalysis(story.headline, articles);
      await db.run(
        `INSERT INTO summaries (story_id, version, input_hash, article_ids, payload, model, prompt_version, input_scope,
           generated_at, last_attempt_at, last_attempt_ok, last_attempt_input_hash, last_error, invalidated_reason)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $8, 1, $2, NULL, NULL)
         ON CONFLICT (story_id) DO UPDATE SET version = summaries.version + 1, input_hash = $2, article_ids = $3, payload = $4,
           model = $5, prompt_version = $6, input_scope = $7, generated_at = $8, last_attempt_at = $8, last_attempt_ok = 1,
           last_attempt_input_hash = $2, last_error = NULL, invalidated_reason = NULL`,
        [story.id, story.input_hash, JSON.stringify(articles.map((a) => a.id)), JSON.stringify(analysis), model,
          config.promptVersion, INPUT_SCOPE, calledAt]
      );
      await logAiCall(db, { id: callId, job, story, calledAt, model, outcome: "success", usage });
      job.summaries_generated += 1;
    } catch (error) {
      const message = String(error.message ?? error).slice(0, 300);
      if (error.outcome === "rate_limited") {
        // Free-tier quota: not this story's fault. Leave it pending and retry next run.
        await logAiCall(db, { id: callId, job, story, calledAt, model: config.aiModel, outcome: "rate_limited", usage: error.usage, error: message });
        job.notes.push(`AI quota or rate limit reached; ${due.length - calls + 1} story summaries deferred to a later run`);
        break;
      }
      await db.run(
        `INSERT INTO summaries (story_id, version, last_attempt_at, last_attempt_ok, last_attempt_input_hash, last_error)
         VALUES ($1, 0, $2, 0, $3, $4)
         ON CONFLICT (story_id) DO UPDATE SET last_attempt_at = $2, last_attempt_ok = 0, last_attempt_input_hash = $3, last_error = $4`,
        [story.id, calledAt, story.input_hash, message]
      );
      await logAiCall(db, { id: callId, job, story, calledAt, model: config.aiModel, outcome: error.outcome ?? "error", usage: error.usage, error: message });
      job.summaries_failed += 1;
      if (job.summaries_failed <= 3) job.notes.push(`AI summary failed for ${story.id}: ${message}`);
      // A persistent outage (bad key, no credit) would fail every call; stop early.
      if (/401|403|authentication|api key|credit|not configured/i.test(message)) {
        job.notes.push("Stopped AI generation for this run after an account-level error");
        break;
      }
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function logAiCall(db, { id, job, story, calledAt, model, outcome, usage, error = null }) {
  await db.run(
    `INSERT INTO ai_calls (id, job_id, story_id, called_at, model, outcome, input_tokens, output_tokens, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, job.id, story.id, calledAt, model, outcome, usage?.input_tokens ?? null, usage?.output_tokens ?? null, error]
  );
}
