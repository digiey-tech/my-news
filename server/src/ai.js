// AI overview and perspectives for a story, generated on the server only.
// Supports any OpenAI-compatible API (Google Gemini by default, Groq,
// OpenRouter) and the Anthropic Claude API. Provider settings live in
// prompts/model_config.json and can be overridden with environment variables.
import fs from "node:fs";
import path from "node:path";
import { config, ROOT_DIR } from "./config.js";

const promptDir = path.join(ROOT_DIR, "prompts");
const SYSTEM_PROMPT = fs.readFileSync(path.join(promptDir, "summary_system.md"), "utf8");
const USER_TEMPLATE = fs.readFileSync(path.join(promptDir, "summary_user_template.md"), "utf8");
const OUTPUT_SCHEMA = JSON.parse(fs.readFileSync(path.join(promptDir, "summary_schema.json"), "utf8"));

export const INPUT_SCOPE = "RSS feed excerpts (headline and short description), not full article text";

// Some providers/models reject strict JSON schemas. After the first such
// rejection we switch to plain JSON mode with the schema written in the prompt.
let schemaModeRejected = false;

function escapeData(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// articles: [{ id, publisher, title, excerpt, publishedAt, url }] sorted for ref numbering.
export function buildUserPrompt(headline, articles) {
  const blocks = articles.map((article, i) => [
    `<article ref="${i + 1}" publisher="${escapeData(article.publisher)}" published="${article.publishedAt}">`,
    `<title>${escapeData(article.title)}</title>`,
    `<excerpt>${escapeData(article.excerpt || "(no excerpt in feed)")}</excerpt>`,
    "</article>"
  ].join("\n"));
  return USER_TEMPLATE
    .replace("{{headline}}", escapeData(headline))
    .replace("{{input_scope}}", INPUT_SCOPE)
    .replace("{{article_count}}", String(articles.length))
    .replace("{{publisher_count}}", String(new Set(articles.map((a) => a.publisher)).size))
    .replace("{{articles}}", blocks.join("\n"));
}

function cleanRefs(refs, count) {
  return [...new Set((Array.isArray(refs) ? refs : []).filter((ref) => Number.isInteger(ref) && ref >= 1 && ref <= count))].sort((a, b) => a - b);
}

// Validates model output and keeps only claims that cite real input articles.
export function validateAnalysis(raw, articles) {
  const count = articles.length;
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  const overview = text(raw?.overview);
  if (!overview) throw new Error("Model output had no overview");

  let perspectives = (Array.isArray(raw?.perspectives) ? raw.perspectives : [])
    .map((p) => ({ name: text(p?.name), summary: text(p?.summary), evidence_limits: text(p?.evidence_limits), refs: cleanRefs(p?.refs, count) }))
    .filter((p) => p.name && p.summary && p.refs.length > 0);
  let perspectivesStatus = raw?.perspectives_status === "supported" ? "supported" : "insufficient_evidence";
  if (perspectivesStatus === "supported" && perspectives.length < 2) perspectivesStatus = "insufficient_evidence";
  if (perspectivesStatus === "insufficient_evidence") perspectives = [];

  return {
    overview,
    overview_refs: cleanRefs(raw.overview_refs, count),
    agreement: text(raw.agreement),
    agreement_refs: cleanRefs(raw.agreement_refs, count),
    disagreement: text(raw.disagreement),
    disagreement_refs: cleanRefs(raw.disagreement_refs, count),
    uncertainty: text(raw.uncertainty),
    perspectives_status: perspectivesStatus,
    perspectives,
    // Snapshot of what each ref number meant when this analysis was generated.
    references: articles.map((article, i) => ({
      ref: i + 1,
      article_id: article.id,
      publisher: article.publisher,
      title: article.title,
      url: article.url
    }))
  };
}

function failure(message, outcome, usage = null) {
  const error = new Error(message);
  error.outcome = outcome;
  error.usage = usage;
  return error;
}

// Parses the model's JSON, tolerating a ```json fence some models add.
function parseJsonText(text, usage) {
  const cleaned = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw failure("Model output was not valid JSON", "invalid", usage);
  }
}

const TEMPORARY_STATUS = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [5_000, 15_000];

// Free tiers often answer "high demand" (503) briefly; retry before giving up.
async function callOpenAiCompatible(userPrompt, fetchImpl, retryDelays = RETRY_DELAYS_MS) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOpenAiCompatibleOnce(userPrompt, fetchImpl);
    } catch (error) {
      if (error.temporary && attempt < retryDelays.length) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        continue;
      }
      throw error;
    }
  }
}

async function callOpenAiCompatibleOnce(userPrompt, fetchImpl) {
  if (!config.aiBaseUrl || !config.aiModel) throw failure("AI_BASE_URL and AI_MODEL must be set for this provider", "error");
  const useSchema = !schemaModeRejected;
  const system = useSchema
    ? SYSTEM_PROMPT
    : `${SYSTEM_PROMPT}\nReturn only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(OUTPUT_SCHEMA)}`;
  const body = {
    model: config.aiModel,
    max_tokens: config.aiMaxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt }
    ],
    response_format: useSchema
      ? { type: "json_schema", json_schema: { name: "story_analysis", strict: true, schema: OUTPUT_SCHEMA } }
      : { type: "json_object" }
  };
  if (config.aiSendReasoningEffort) body.reasoning_effort = config.aiEffort;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  let response;
  try {
    response = await fetchImpl(`${config.aiBaseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.aiApiKey}` },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw failure(error.name === "AbortError" ? "AI request timed out" : `AI request failed: ${error.message}`, "error");
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (response.status === 429) {
    throw failure(`AI rate limit or quota reached (HTTP 429): ${raw.slice(0, 160)}`, "rate_limited");
  }
  if (response.status === 400 && useSchema && /schema|response_format|json/i.test(raw)) {
    schemaModeRejected = true;
    return callOpenAiCompatibleOnce(userPrompt, fetchImpl);
  }
  if (!response.ok) {
    const error = failure(`AI provider returned HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 200)}`, "error");
    error.temporary = TEMPORARY_STATUS.has(response.status);
    throw error;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw failure("AI provider returned a response that was not JSON", "error");
  }
  const usage = { input_tokens: data.usage?.prompt_tokens ?? null, output_tokens: data.usage?.completion_tokens ?? null };
  const choice = data.choices?.[0];
  if (!choice) throw failure("AI provider returned no answer", "invalid", usage);
  if (choice.finish_reason === "length") throw failure("Model output was cut off (max_tokens)", "invalid", usage);
  if (choice.finish_reason === "content_filter" || choice.message?.refusal) throw failure("Model declined the request", "refusal", usage);
  return { parsed: parseJsonText(choice.message?.content, usage), usage, model: data.model || config.aiModel };
}

// Models that accept the server-side "default" refusal fallback.
const ANTHROPIC_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
let anthropicClient = null;

async function callAnthropic(userPrompt) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  anthropicClient ??= new Anthropic({ apiKey: config.aiApiKey, timeout: 180_000, maxRetries: 2 });
  const request = {
    model: config.aiModel,
    max_tokens: config.aiMaxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { effort: config.aiEffort, format: { type: "json_schema", schema: OUTPUT_SCHEMA } }
  };
  if (ANTHROPIC_FALLBACK_MODELS.has(config.aiModel)) {
    request.betas = ["server-side-fallback-2026-07-01"];
    request.fallbacks = "default";
  }
  let response;
  try {
    response = await anthropicClient.beta.messages.create(request);
  } catch (error) {
    throw failure(`AI request failed: ${error.message}`, error.status === 429 ? "rate_limited" : "error");
  }
  const usage = { input_tokens: response.usage?.input_tokens ?? null, output_tokens: response.usage?.output_tokens ?? null };
  if (response.stop_reason === "refusal") throw failure(`Model declined the request (${response.stop_details?.category ?? "no category"})`, "refusal", usage);
  if (response.stop_reason === "max_tokens") throw failure("Model output was cut off (max_tokens)", "invalid", usage);
  const textBlock = response.content.find((block) => block.type === "text");
  return { parsed: parseJsonText(textBlock?.text, usage), usage, model: response.model ?? config.aiModel };
}

// Calls the model once. Returns { analysis, usage, model }. Throws on failure
// with error.outcome = error | rate_limited | refusal | invalid.
export async function generateAnalysis(headline, articles, { fetchImpl = fetch, retryDelays } = {}) {
  if (!config.aiApiKey) throw failure(`${config.aiApiKeyEnv} is not configured`, "error");
  const userPrompt = buildUserPrompt(headline, articles);
  const { parsed, usage, model } = config.aiApi === "anthropic"
    ? await callAnthropic(userPrompt)
    : await callOpenAiCompatible(userPrompt, fetchImpl, retryDelays);
  try {
    return { analysis: validateAnalysis(parsed, articles), usage, model };
  } catch (error) {
    throw failure(error.message, "invalid", usage);
  }
}

export function resetProviderStateForTests() {
  schemaModeRejected = false;
}
