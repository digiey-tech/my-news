// HTTP API. Every read endpoint only reads stored results: no request here
// fetches news or calls the AI model. Only the protected admin endpoint can
// start a collection run.
import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";
import { cutoffIso, runCollection } from "./collector.js";

const AI_LABEL = "AI-generated";

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

async function lastSuccessfulCollection(db) {
  const row = await db.get(
    "SELECT finished_at FROM job_runs WHERE status IN ('success', 'partial') ORDER BY started_at DESC LIMIT 1"
  );
  return row?.finished_at ?? null;
}

async function lastRun(db) {
  const row = await db.get("SELECT id, trigger, started_at, finished_at, status FROM job_runs ORDER BY started_at DESC LIMIT 1");
  return row ?? null;
}

// Decides what the reader may see from a stored summary right now.
export function aiView(summary, story, activeArticleIds, publisherCount = Infinity) {
  const base = { label: AI_LABEL, status: "pending", message: "", analysis: null };
  if (!summary?.payload && publisherCount < config.aiMinPublishers) {
    return {
      ...base,
      status: "skipped",
      message: `AI analysis is generated only for stories covered by at least ${config.aiMinPublishers} publishers. Use the publisher buttons to read the coverage.`
    };
  }
  if (summary?.payload) {
    const usedIds = parseJson(summary.article_ids, []);
    const missing = usedIds.filter((id) => !activeArticleIds.has(id));
    if (missing.length > 0) {
      return {
        ...base,
        status: "unavailable",
        message: "The previous AI analysis relied on coverage that has now expired, so it is no longer shown. A new analysis is generated during the next hourly update."
      };
    }
    const payload = parseJson(summary.payload, null);
    if (!payload) return { ...base, status: "failed", message: "Stored AI analysis could not be read." };
    const references = payload.references.map((ref) => ({ ...ref, available: activeArticleIds.has(ref.article_id) }));
    const analysis = {
      ...payload,
      references,
      perspectives: payload.perspectives.map((p, i) => ({ id: `p${i + 1}`, ...p })),
      generated_at: summary.generated_at,
      model: summary.model,
      version: summary.version,
      prompt_version: summary.prompt_version,
      input_scope: summary.input_scope
    };
    if (summary.input_hash !== story.input_hash) {
      const newer = [...activeArticleIds].filter((id) => !usedIds.includes(id)).length;
      return {
        ...base,
        status: "outdated",
        message: newer > 0
          ? `Outdated: generated before ${newer} newer article(s) joined this story. An update is scheduled for the next hourly run.`
          : "Outdated: the coverage changed after this analysis was generated. An update is scheduled for the next hourly run.",
        analysis
      };
    }
    return { ...base, status: "ready", message: "", analysis };
  }
  if (summary?.invalidated_reason) {
    return { ...base, status: "unavailable", message: "The previous AI analysis relied on coverage that has expired. A new analysis is generated during the next hourly update." };
  }
  if (summary && summary.last_attempt_ok === 0) {
    return { ...base, status: "failed", message: "AI analysis could not be generated for this story in the last update. Original coverage is still available below; the server will try again later." };
  }
  return { ...base, status: "pending", message: "AI analysis has not been generated for this story yet. Analyses are created during the hourly server update." };
}

// Expired articles are excluded at read time too, so nothing older than the
// window is served between hourly cleanup runs.
async function loadActive(db, now, storyId = null) {
  const cutoff = cutoffIso(now);
  const rows = storyId
    ? await db.all(`SELECT * FROM articles WHERE published_at >= $1 AND story_id = $2 ORDER BY published_at DESC`, [cutoff, storyId])
    : await db.all("SELECT id, story_id, publisher, published_at FROM articles WHERE published_at >= $1 AND story_id IS NOT NULL", [cutoff]);
  return rows;
}

export function createApp(db, { now = () => new Date() } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("json spaces", 0);
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Cache-Control", "no-cache");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/", (req, res) => {
    res.json({
      service: "My News API",
      endpoints: ["GET /api/stories", "GET /api/stories/:id", "GET /api/status", "GET /health", "POST /api/admin/collect (admin token)"]
    });
  });

  app.get("/health", async (req, res) => {
    try {
      await db.get("SELECT 1 AS ok");
      res.json({ ok: true, time: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ ok: false, error: "database unavailable" });
    }
  });

  app.get("/api/stories", async (req, res, next) => {
    try {
      const articles = await loadActive(db, now());
      const byStory = new Map();
      for (const article of articles) {
        if (!byStory.has(article.story_id)) byStory.set(article.story_id, []);
        byStory.get(article.story_id).push(article);
      }
      const stories = await db.all("SELECT id, headline, updated_at, input_hash FROM stories");
      const summaries = new Map((await db.all("SELECT * FROM summaries")).map((row) => [row.story_id, row]));

      const items = stories
        .filter((story) => byStory.has(story.id))
        .map((story) => {
          const members = byStory.get(story.id);
          const publishers = [...new Set(members.map((a) => a.publisher))].sort();
          const latest = members.reduce((max, a) => (a.published_at > max ? a.published_at : max), members[0].published_at);
          const ai = aiView(summaries.get(story.id), story, new Set(members.map((a) => a.id)), publishers.length);
          return {
            id: story.id,
            headline: story.headline,
            latest_article_at: latest,
            updated_at: story.updated_at,
            publisher_count: publishers.length,
            article_count: members.length,
            publishers,
            ai_status: ai.status
          };
        })
        .sort((a, b) => b.latest_article_at.localeCompare(a.latest_article_at));

      res.json({
        server_time: now().toISOString(),
        ordering: "newest first (latest article publication time)",
        retention_hours: config.retentionHours,
        last_successful_collection_at: await lastSuccessfulCollection(db),
        last_run: await lastRun(db),
        count: items.length,
        stories: items
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stories/:id", async (req, res, next) => {
    try {
      const story = await db.get("SELECT * FROM stories WHERE id = $1", [req.params.id]);
      const members = story ? await loadActive(db, now(), story.id) : [];
      if (!story || members.length === 0) {
        return res.status(404).json({ error: "not_found", message: "This story is no longer available. It may have expired from the seven-day window." });
      }

      const publishers = new Map();
      for (const article of members) {
        if (!publishers.has(article.publisher)) publishers.set(article.publisher, []);
        publishers.get(article.publisher).push({
          id: article.id,
          title: article.title,
          url: article.url,
          excerpt: article.excerpt,
          published_at: article.published_at,
          published_at_estimated: article.published_at_source !== "feed"
        });
      }
      const background = await db.all(
        `SELECT r.title, r.description, r.url, r.source, sb.matched_term FROM story_background sb
         JOIN background_resources r ON r.id = sb.resource_id WHERE sb.story_id = $1 ORDER BY sb.position`,
        [story.id]
      );
      const summary = await db.get("SELECT * FROM summaries WHERE story_id = $1", [story.id]);
      const ai = aiView(summary, story, new Set(members.map((a) => a.id)), new Set(members.map((a) => a.publisher)).size);

      res.json({
        id: story.id,
        headline: story.headline,
        updated_at: story.updated_at,
        latest_article_at: members[0].published_at,
        publisher_count: publishers.size,
        article_count: members.length,
        keywords: parseJson(story.keywords, []),
        excerpt_notice: "Excerpts are the publishers' original feed text, not full articles. Open a publisher to read the original coverage.",
        publishers: [...publishers.entries()]
          .map(([name, articles]) => ({ name, articles }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        background: {
          status: background.length ? "available" : "none",
          message: background.length ? "" : "No background resource available",
          method: "Automatically matched Wikipedia articles for names and places shared by this story's coverage.",
          resources: background
        },
        ai,
        last_successful_collection_at: await lastSuccessfulCollection(db)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/status", async (req, res, next) => {
    try {
      const runs = await db.all("SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 48");
      const feeds = await db.all("SELECT * FROM feed_status ORDER BY publisher, feed_url");
      const since = new Date(now().getTime() - 24 * 3_600_000).toISOString();
      const aiCalls = await db.all("SELECT outcome, COUNT(*) AS n FROM ai_calls WHERE called_at >= $1 GROUP BY outcome", [since]);
      const aiTotal = await db.get("SELECT COUNT(*) AS n FROM ai_calls");
      res.json({
        server_time: now().toISOString(),
        last_successful_collection_at: await lastSuccessfulCollection(db),
        schedule: "Hourly (GitHub Actions cron '5 * * * *' calling POST /api/admin/collect)",
        ai_provider: config.aiProvider,
        ai_model: config.aiModel,
        ai_calls_last_24h: Object.fromEntries(aiCalls.map((row) => [row.outcome, Number(row.n)])),
        ai_calls_total: Number(aiTotal?.n ?? 0),
        feeds,
        runs: runs.map((run) => ({ ...run, notes: parseJson(run.notes, []) }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/collect", async (req, res, next) => {
    if (!config.adminToken) return res.status(503).json({ error: "admin_disabled", message: "ADMIN_TOKEN is not configured on the server." });
    const supplied = Buffer.from(String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(config.adminToken);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      const trigger = req.query.trigger === "schedule" ? "schedule" : "admin";
      res.json(await runCollection(db, { trigger }));
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => res.status(404).json({ error: "not_found", message: "Unknown endpoint." }));
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "server_error", message: "The server could not complete this request. Please try again." });
  });
  return app;
}
