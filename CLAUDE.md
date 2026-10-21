# My News: notes for Claude Code

CS 403 class project (due **Friday, October 23, 2026, 11:59 p.m. Eastern**). An AI-powered news service: a deployed backend collects news hourly, groups articles about the same event into stories, adds Wikipedia background links, and generates shared AI summaries. A Flutter app shows the stored results. The assignment PDF (`My_News_Assignment.pdf`) is the spec; the README maps each requirement to the code.

## Layout
- `server/`: Node.js 22+ (ES modules), Express. Postgres in production (`DATABASE_URL`), built-in `node:sqlite` locally (`SQLITE_PATH`, default `server/data/mynews.db`). Same SQL for both (`$1` placeholders, timestamps as ISO UTC text).
  - `src/collector.js`: the hourly job: fetch → dedupe → 168 h retention → grouping → background → AI summaries → `job_runs` record.
  - `src/grouping.js`, `src/text.js`: TF-IDF + entity/event-term rules; tuned on live data. Re-check with `node scripts/grouping-report.js --pairs` after any change.
  - `src/background.js`: Wikipedia lookup with strict title matching.
  - `src/ai.js`: provider adapter. Default **Gemini** (`gemini-3.8-flash`) via its OpenAI-compatible endpoint; also `openai_compatible` (Groq/OpenRouter) and `anthropic`. Settings: `prompts/model_config.json` + env vars.
  - `src/api.js`: read-only `GET /api/stories`, `GET /api/stories/:id`, `GET /api/status`, `GET /health`; `POST /api/admin/collect` needs `Authorization: Bearer $ADMIN_TOKEN`.
  - `prompts/`: system prompt, user template, JSON schema, model config (required by the assignment to be in the repo).
  - `test/`: `npm test` (20 tests, no network; fake feeds/AI and a controllable clock).
  - `scripts/`: `collect.js`, `grouping-report.js`, `export-summary.js` (summary vs. inputs, for the AI review), `seed-fixture.js`.
- `app/`: Flutter client (package `my_news`). Server URL via `--dart-define=API_BASE_URL=...`. `flutter test` (5 tests). Screens in `lib/screens/`, offline cache in `lib/repository.dart`.
- `render.yaml`: Render web service (root `server/`). `.github/workflows/hourly-collect.yml`: hourly cron calling the admin endpoint (secrets `MYNEWS_API_URL`, `MYNEWS_ADMIN_TOKEN`).
- `docs/`: verification table, grouping examples, AI review template, defect log, release notes, demo checklist, AI reflection draft.
- `myNews/`: the original starter project, kept for reference only.

## Rules
- **Never commit or print secrets.** `server/.env` (git-ignored) holds the local `GEMINI_API_KEY` and `ADMIN_TOKEN`. Production secrets live only in the Render dashboard and GitHub Actions secrets. Never put keys in the Flutter app.
- **The app must never fetch news, group articles, or call an AI model.** It only reads the API. All of that work happens on the server.
- **Never fabricate AI output or verification results.** Rows marked TODO in `docs/VERIFICATION.md` and `docs/AI_REVIEW.md` must be filled from real runs; failed generation shows an honest status, never placeholder text labeled "AI-generated".
- Don't send the user's email address to external services (the `CONTACT` value goes into User-Agent headers; it stays a placeholder unless the user sets it).
- Commit with `git commit -m` / `-F`; the user's global git editor (Notepad++) is not installed, so an editor-based commit hangs.
- After code changes, run `npm test` in `server/` and `flutter analyze` + `flutter test` in `app/`.

## Decisions already made
- AI: Gemini free tier, not Claude (the user has no paid API credits; a Claude subscription cannot be used by a server). Free-tier quotas are not published; defaults are `MAX_AI_CALLS_PER_RUN=10`, 7 s between calls, 429 → stop for the hour and leave stories pending, 5xx → retry twice. `AI_MIN_PUBLISHERS=2` is the quota-saving switch.
- Hosting: Render free web service + Neon free Postgres + GitHub Actions cron. The repo should be **public** so Actions minutes are unlimited (pending the user's confirmation).
- The project was moved out of the Flutter SDK folder (`C:\Users\NewDi\flutter\examples\myNews (1)`) on 2026-10-21; that old copy is obsolete.

## Status (2026-10-21)
Done: server, app, tests, docs; release APK builds; Gemini key tested locally (2 real summaries generated into `server/data/e2e.db`); first git commit made on `main`.

Next:
1. Push to GitHub (`gh` is logged in as `digiey-tech`): `gh repo create my-news --public --source=. --push`.
2. Create Neon project; put `DATABASE_URL` in Render (and optionally `server/.env` to test with `npm run collect`).
3. Deploy on Render via Blueprint; set `DATABASE_URL`, `GEMINI_API_KEY` (preferably a fresh key; the current one was pasted in chat), `CONTACT`. Check `/health`.
4. Add the two GitHub Actions secrets; run the workflow manually once; confirm hourly runs in `/api/status`.
5. Rebuild the APK with the real URL: `flutter build apk --release --dart-define=API_BASE_URL=https://<service>.onrender.com`; install on the phone.
6. Fill in TODOs: `docs/VERIFICATION.md` (scheduled runs, 3 phone runs, Phone Link), `docs/AI_REVIEW.md` (3 real summaries; two citation slips were already spotted in local output: the Harry story cites Fox [4] for "GQ Magazine", and the Hurts story claims sources agree on full recovery when only CBS [3] says so), and the ✏️ parts of `docs/AI_REFLECTION.md` (the user's own words).
7. Update the deployed API URL placeholder in `README.md`.
