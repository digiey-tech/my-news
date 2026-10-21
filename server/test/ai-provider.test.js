// Tests the OpenAI-compatible (Gemini) adapter against a fake HTTP endpoint.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-key";
const { generateAnalysis, resetProviderStateForTests } = await import("../src/ai.js");
const { config } = await import("../src/config.js");

const articles = [
  { id: "x1", publisher: "NPR", title: "Council approves bus hours", excerpt: "Vote passed 7-2.", publishedAt: "2026-10-20T10:00:00.000Z", url: "https://n/1" },
  { id: "x2", publisher: "BBC News", title: "City backs longer bus service", excerpt: "Funding unclear.", publishedAt: "2026-10-20T11:00:00.000Z", url: "https://b/2" }
];

const goodOutput = {
  overview: "The council approved longer bus hours.", overview_refs: [1, 2],
  agreement: "Both report the vote.", agreement_refs: [1, 2],
  disagreement: "No meaningful disagreement in the available coverage.", disagreement_refs: [],
  uncertainty: "Funding is unclear.", perspectives_status: "insufficient_evidence", perspectives: []
};

function fakeFetch(responses) {
  const requests = [];
  const impl = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    const next = responses.shift();
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  impl.requests = requests;
  return impl;
}

const completion = (content, extra = {}) => ({
  model: "gemini-3.8-flash",
  choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
  usage: { prompt_tokens: 900, completion_tokens: 300 },
  ...extra
});

beforeEach(() => resetProviderStateForTests());

test("Gemini is the default provider with its OpenAI-compatible endpoint", async () => {
  assert.equal(config.aiProvider, "gemini");
  const fetchImpl = fakeFetch([{ body: completion(goodOutput) }]);
  const result = await generateAnalysis("Bus hours", articles, { fetchImpl });

  const [request] = fetchImpl.requests;
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(request.init.headers.Authorization, "Bearer test-key");
  assert.equal(request.body.model, "gemini-3.8-flash");
  assert.equal(request.body.response_format.type, "json_schema");
  assert.match(request.body.messages[1].content, /<article ref="1" publisher="NPR"/);
  assert.equal(result.analysis.overview, goodOutput.overview);
  assert.deepEqual(result.usage, { input_tokens: 900, output_tokens: 300 });
});

test("falls back to JSON mode when the schema format is rejected", async () => {
  const fetchImpl = fakeFetch([
    { status: 400, body: { error: { message: "Invalid JSON schema in response_format" } } },
    { body: completion("```json\n" + JSON.stringify(goodOutput) + "\n```") }
  ]);
  const result = await generateAnalysis("Bus hours", articles, { fetchImpl });
  assert.equal(fetchImpl.requests[1].body.response_format.type, "json_object");
  assert.match(fetchImpl.requests[1].body.messages[0].content, /JSON Schema/);
  assert.equal(result.analysis.overview, goodOutput.overview);
});

test("quota errors are reported as rate_limited, not as story failures", async () => {
  const fetchImpl = fakeFetch([{ status: 429, body: { error: { message: "Resource has been exhausted (quota)" } } }]);
  await assert.rejects(generateAnalysis("Bus hours", articles, { fetchImpl }), (error) => error.outcome === "rate_limited");
});

test("truncated or non-JSON output is rejected instead of shown", async () => {
  await assert.rejects(
    generateAnalysis("Bus hours", articles, { fetchImpl: fakeFetch([{ body: completion("{\"overview\": \"cut", { choices: [{ finish_reason: "length", message: { content: "{" } }] }) }]) }),
    (error) => error.outcome === "invalid"
  );
  await assert.rejects(
    generateAnalysis("Bus hours", articles, { fetchImpl: fakeFetch([{ body: completion("Sure! Here is a summary.") }]) }),
    (error) => error.outcome === "invalid"
  );
});

test("temporary 'high demand' errors are retried", async () => {
  const busy = { status: 503, body: [{ error: { code: 503, message: "This model is currently experiencing high demand." } }] };
  const fetchImpl = fakeFetch([busy, { body: completion(goodOutput) }]);
  const result = await generateAnalysis("Bus hours", articles, { fetchImpl, retryDelays: [1, 1] });
  assert.equal(fetchImpl.requests.length, 2);
  assert.equal(result.analysis.overview, goodOutput.overview);

  const alwaysBusy = fakeFetch([busy, busy, busy]);
  await assert.rejects(generateAnalysis("Bus hours", articles, { fetchImpl: alwaysBusy, retryDelays: [1, 1] }), /HTTP 503/);
  assert.equal(alwaysBusy.requests.length, 3);
});
