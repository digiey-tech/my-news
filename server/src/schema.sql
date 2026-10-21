-- My News database schema. Runs on both Postgres and SQLite.
-- Timestamps are ISO-8601 UTC strings, for example 2026-10-20T14:05:00.000Z.
-- JSON columns are stored as TEXT.

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,                  -- sha1 of normalized_url (stable identifier)
  publisher TEXT NOT NULL,              -- display name, for example BBC News
  feed_url TEXT NOT NULL,
  url TEXT NOT NULL,                    -- original link from the feed
  normalized_url TEXT NOT NULL UNIQUE,  -- duplicate-prevention key
  title TEXT NOT NULL,
  excerpt TEXT,                         -- feed description (original wording)
  published_at TEXT NOT NULL,           -- publication time used for retention
  published_at_source TEXT NOT NULL,    -- feed or first_seen (missing or invalid date)
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  story_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at);
CREATE INDEX IF NOT EXISTS idx_articles_story ON articles (story_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,                  -- stable: derived from the founding article
  headline TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,             -- last time membership or content changed
  latest_article_at TEXT NOT NULL,
  input_hash TEXT NOT NULL,             -- hash of member article ids and content hashes
  keywords TEXT,                        -- JSON array of top terms
  background_hash TEXT                  -- input_hash used for the last background lookup
);

CREATE TABLE IF NOT EXISTS summaries (
  story_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,   -- increments on every successful generation
  input_hash TEXT,                      -- story input_hash the payload was generated from
  article_ids TEXT,                     -- JSON array of article ids given to the model
  payload TEXT,                         -- JSON: overview, perspectives, references
  model TEXT,
  prompt_version TEXT,
  input_scope TEXT,
  generated_at TEXT,
  last_attempt_at TEXT,
  last_attempt_ok INTEGER,
  last_attempt_input_hash TEXT,
  last_error TEXT,
  invalidated_reason TEXT
);

CREATE TABLE IF NOT EXISTS background_resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_background (
  story_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  matched_term TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, resource_id)
);

CREATE TABLE IF NOT EXISTS feed_status (
  feed_url TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_item_count INTEGER
);

-- Operational log: holds no article text or summary text, so it may outlive the news window.
CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,                -- schedule, admin, internal, cli
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,                 -- running, success, partial, failed
  feeds_ok INTEGER DEFAULT 0,
  feeds_failed INTEGER DEFAULT 0,
  articles_fetched INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,
  articles_updated INTEGER DEFAULT 0,
  articles_expired INTEGER DEFAULT 0,
  stories_created INTEGER DEFAULT 0,
  stories_removed INTEGER DEFAULT 0,
  summaries_generated INTEGER DEFAULT 0,
  summaries_failed INTEGER DEFAULT 0,
  summaries_invalidated INTEGER DEFAULT 0,
  background_links INTEGER DEFAULT 0,
  notes TEXT                            -- JSON array of short messages
);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs (started_at);

-- One row per model call. Used to show that reads never trigger generation.
CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  story_id TEXT,
  called_at TEXT NOT NULL,
  model TEXT,
  outcome TEXT NOT NULL,                -- success, error, refusal, invalid
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT
);
