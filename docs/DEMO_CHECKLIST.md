# Presentation checklist (5-7 minutes)

**Before class:** phone charged, Do Not Disturb on (hide personal notifications), Phone Link connected and mirroring, release APK installed, text size readable on the projector. Open the app once beforehand so the free server is awake. Have these tabs ready: GitHub Actions run history, `https://<service>/api/status`, Render dashboard.

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Title, architecture diagram (README) | Server collects hourly, groups, summarizes, stores; the app only reads. |
| 0:45 | **Phone via Phone Link:** launch app, story list | One entry per story, publisher count, latest time, "Updated ..." from the last server run. Pull to refresh = read from our server only. |
| 1:30 | Open a 3-publisher story | Overview, one button per publisher that covered it; open one publisher article, come back (story preserved). |
| 2:15 | Background section | Wikipedia link chosen on the server from names shared by the coverage; show a story with "No background resource available". |
| 2:45 | AI analysis → a perspective → switch → back | "AI-generated" label, generated time, [n] citations open the source, input scope = feed excerpts. Show "Insufficient evidence for distinct perspectives" on another story. |
| 3:45 | Browser: `/api/status` and GitHub Actions history | Two+ consecutive scheduled runs with start time, status, counts; feed failures recorded. |
| 4:30 | Two clients reuse results | Same story on phone and in the browser: identical analysis `version` and `generated_at`; `ai_calls_total` does not change when reading. |
| 5:15 | Retention + failures | 168-hour window by publication time; tests with controlled timestamps (`npm test` output); airplane mode → offline banner with saved stories. |
| 6:00 | Limitations | Ebola grouping example, excerpt-only AI input, cold start. |
