import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "..");

// Minimal .env loader so local development needs no extra dependency.
const envFile = path.join(ROOT_DIR, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const modelConfig = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "prompts", "model_config.json"), "utf8"));

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const aiProvider = process.env.AI_PROVIDER || modelConfig.provider;
const providerConfig = modelConfig.providers[aiProvider];
if (!providerConfig) {
  throw new Error(`Unknown AI_PROVIDER "${aiProvider}". Use one of: ${Object.keys(modelConfig.providers).join(", ")}`);
}

export const config = {
  port: intEnv("PORT", 8080),
  databaseUrl: process.env.DATABASE_URL || "",
  sqlitePath: process.env.SQLITE_PATH || path.join(ROOT_DIR, "data", "mynews.db"),
  adminToken: process.env.ADMIN_TOKEN || "",
  aiProvider,
  aiApi: providerConfig.api,
  aiApiKeyEnv: providerConfig.api_key_env,
  aiApiKey: process.env[providerConfig.api_key_env] || "",
  aiBaseUrl: (process.env.AI_BASE_URL || providerConfig.base_url || "").replace(/\/+$/, ""),
  aiModel: process.env.AI_MODEL || providerConfig.model,
  aiEffort: process.env.AI_EFFORT || modelConfig.effort,
  aiSendReasoningEffort: providerConfig.send_reasoning_effort === true,
  // Spacing between model calls, to stay under free-tier requests-per-minute limits.
  aiMinIntervalMs: intEnv("AI_MIN_INTERVAL_MS", providerConfig.min_interval_ms ?? 0),
  aiMaxTokens: modelConfig.max_tokens,
  promptVersion: modelConfig.prompt_version,
  maxAiCallsPerRun: intEnv("MAX_AI_CALLS_PER_RUN", 10),
  // Set to 2 to save quota: only multi-publisher stories get an AI analysis.
  aiMinPublishers: Math.max(1, intEnv("AI_MIN_PUBLISHERS", 1)),
  maxBackgroundLookupsPerRun: intEnv("MAX_BACKGROUND_LOOKUPS_PER_RUN", 60),
  enableInternalScheduler: process.env.ENABLE_INTERNAL_SCHEDULER === "true",
  contact: process.env.CONTACT || "mynews-cs403@example.edu",
  retentionHours: 168,
  feedTimeoutMs: 15000,
  // Articles further apart than this are never grouped into one story.
  groupingWindowHours: 48,
  // Publication dates more than this far in the future are treated as invalid.
  futureToleranceMinutes: 60
};

export const USER_AGENT = `MyNews/1.0 (CS 403 class project; ${config.contact})`;
