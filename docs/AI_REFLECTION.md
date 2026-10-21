# AI development reflection (draft)

> **Draft written with the AI assistant.** Sections marked ✏️ must be completed or rewritten in your own words. The grade asks what *you* verified, so replace anything you did not personally check.

## Tools used
- **Claude Code** (Anthropic, Claude Opus 5.5) in VS Code: generated the backend, the Flutter client, tests, and documentation drafts from the assignment PDF, then iterated against live feed data and test failures.
- ✏️ Any other tools (Copilot, ChatGPT, Flutter DevTools, etc.).

## Two representative prompts
1. "Edit this project based off of specifications from that file" (with the assignment PDF attached). This produced the architecture, server, Flutter app, and docs.
2. ✏️ A follow-up prompt you used, for example asking for a fix after phone testing or for a change to the AI prompt after reviewing summaries.

## An AI-generated mistake that was found and corrected
The first version of the story-grouping code matched articles when they shared enough capitalized names. Run against the live feeds, it merged **"Elon Musk says Tesla-SpaceX merger being considered"** with **"Elon Musk chose to restrict Ukraine's use of SpaceX satellite network"**: two unrelated events involving the same person, the exact failure the assignment warns about. It also let a "Morning news brief" roundup absorb unrelated stories. The fix required a shared non-name "event" word (such as *merger*), excluded roundups, and added a story-centroid check against chained matches. The fixture test "Senator Mara Quinn" (same person, unrelated events) now guards against regression. Other AI mistakes caught the same way are listed in [DEFECT_LOG.md](DEFECT_LOG.md) (D1-D9), including Wikipedia links to "Ice" for the agency ICE and a missing INTERNET permission that would have broken the release APK.

## What I personally verified
✏️ Replace with your own checks, for example:
- Read the grouping report for the live feeds and judged which groups were correct.
- Ran `npm test` and `flutter test` and read what each test asserts.
- Deployed to Render/Neon, confirmed two consecutive scheduled runs in `/api/status`.
- Installed the release APK on my phone and completed the core workflow three times.
- Reviewed three AI summaries against their inputs (AI_REVIEW.md).
- Confirmed no API keys appear in the Flutter build or the repository (`git grep sk-ant`).

## Team contributions
✏️ If this is a team submission, list each member's contributions.
