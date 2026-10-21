# Verification evidence

Two kinds of evidence:
- **Automated:** `cd server && npm test` (19 tests, controlled clock, real RSS parser, fake AI and feeds) and `cd app && flutter test` (5 tests). Results below are from 2026-10-21.
- **Deployed:** checks that need the live service, the phone, and Phone Link. These are marked **TODO** until you run them; record the actual result, date, and a screenshot or log link.

| Check | Expected result | How verified | Actual result |
| --- | --- | --- | --- |
| Repeated ingestion | Fetching identical inputs twice does not duplicate articles or stories | Test `repeated ingestion does not duplicate articles or stories`; live: two `npm run collect` runs (second: `articles_new: 0`, `stories_created: 0`) | **Pass** (automated + local live run 2026-10-21). Deployed: TODO, compare two consecutive `job_runs` |
| Same event, different publishers | Articles appear under one story with working publisher buttons | Fixture test (5 groups) + live report ([GROUPING_EXAMPLES.md](GROUPING_EXAMPLES.md), 18 multi-publisher stories); Flutter widget test opens story and shows publisher buttons | **Pass** (automated + live data). Phone: TODO, tap each publisher button on a 3-publisher story |
| Similar topic, different events | Unrelated events remain separate | Fixture: Senator Quinn pair, two wildfires; live: Musk merger vs Musk/Ukraine, Florida vs Alabama death penalty | **Pass** |
| Hourly automation | Deployed config and ≥ 2 consecutive scheduled-run records without client activity | [hourly-collect.yml](../.github/workflows/hourly-collect.yml); `GET /api/status` → `runs[]` with `trigger: "schedule"` about one hour apart | **TODO**: screenshot of GitHub Actions run history + `/api/status` showing two consecutive scheduled runs |
| Seven-day boundary | Expired articles leave the API and are removed during cleanup; recent ones remain | Test `seven-day boundary...`: article at 167.5 h visible; one hour later (no run) excluded from `/api/stories`; cleanup deletes it and its story; 2 h article remains. Items already > 168 h are never stored | **Pass** (automated, controlled timestamps) |
| Missing/invalid dates | Use first-seen time, still expire | Test `missing or invalid publication dates...` | **Pass** |
| Source expiration inside a group | Expired source button disappears; summary no longer depends on removed content | Test `source expiration inside a group...`: NPR button disappears, AI status becomes `unavailable` immediately, next run regenerates version 2 citing only CBS + Guardian | **Pass** (automated) |
| Shared AI output | Repeated reads from two clients reuse the same stored version, no new calls | Test `shared AI output...`: two clients get the same `version`/`generated_at`; `ai_calls` count unchanged. Second run with unchanged inputs: `summaries_generated: 0` | **Pass** (automated). Deployed: TODO, open the same story on phone + browser (`/api/stories/{id}`), compare `version`, check `/api/status` `ai_calls_total` unchanged |
| Provider failure | Unavailable news source or AI model gives clear status; stored stories remain usable | Test `provider failure...`: BBC feed returns 503 → run `partial`, article count unchanged, `feed_status.last_error` recorded; AI outage → existing analysis marked `outdated` with message, first-time failure shows `failed` with no text | **Pass** (automated). Deployed: TODO, e.g. temporarily set an invalid `GEMINI_API_KEY` and run collect |
| Client connectivity failure | Useful retry state or clearly labeled cached content | Flutter tests: `connection failure shows a retry state` and `offline cache hides expired news...` | **Pass** (automated). Phone: TODO, airplane mode → cached list with offline banner; clear data + airplane mode → retry screen |
| Physical-phone presentation | Release build runs on the phone, shown through Phone Link | — | **TODO** |
| Beta-readiness regression | Three consecutive core-workflow runs pass; no open critical/major defects | Flutter widget test covers list → story → AI → perspective → back. [DEFECT_LOG.md](DEFECT_LOG.md): no open critical/major | **TODO** on phone: fill the table below |
| Source fidelity | Excerpts remain original; AI claims traceable | Excerpts shown with "Original wording" tag and "Feed excerpt, not the full article"; AI text tagged "AI-generated" with [n] citation links; server drops invalid citations (test `AI output is validated...`); prompt-injection text is escaped (test `article text is passed... as escaped data`) | **Pass** (automated). Manual review: TODO in [AI_REVIEW.md](AI_REVIEW.md) |

## Release build test runs (fill in on the phone)

Build: `my_news 1.0.0-beta.1`, built with `flutter build apk --release --dart-define=API_BASE_URL=...` · Device: \<model, Android version\> · Backend: \<deployed URL\>

Core workflow = launch → story list loads → open a multi-publisher story → open each publisher button → open a background link → AI analysis → a perspective → switch perspective → back to the list.

| Run | Date/time | Result | Notes / defects |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |

## Automated test output (2026-10-21)

```
server> npm test
✔ repeated ingestion does not duplicate articles or stories
✔ URL normalization treats tracking variants as the same article
✔ same event from different publishers forms one story; related topics stay separate
✔ new coverage joins an existing story without duplicating it
✔ seven-day boundary: expired articles leave the API and are removed by cleanup
✔ missing or invalid publication dates use first-seen time and still expire
✔ source expiration inside a group removes its button and invalidates the summary
✔ shared AI output: repeated reads from two clients never call the model
✔ provider failure: a failed feed or AI outage keeps stored stories usable
✔ background links are stored per story and missing ones are explained
✔ AI output is validated: invalid refs dropped, unsupported perspectives rejected
✔ article text is passed to the model as escaped data
✔ background matching rejects off-topic Wikipedia pages
✔ feed HTML and newsletter boilerplate are removed from excerpts
✔ free-tier quota exhaustion stops the run's AI work and leaves stories pending
✔ Gemini is the default provider with its OpenAI-compatible endpoint
✔ falls back to JSON mode when the schema format is rejected
✔ quota errors are reported as rate_limited, not as story failures
✔ truncated or non-JSON output is rejected instead of shown
ℹ pass 19  ℹ fail 0

app> flutter test
+5: All tests passed!
```

## Live collection run (local, 2026-10-21 02:01 UTC, no AI key)

```
feeds_ok: 8, feeds_failed: 0, articles_fetched: 235, articles_new: 226,
stories_created: 192, background_links: 89, status: success
notes: ["AI summaries skipped: GEMINI_API_KEY is not configured"]
```
