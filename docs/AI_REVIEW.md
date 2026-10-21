# Manual review of three AI summaries

**Status: to be completed after deployment.** No live AI summaries exist yet: the development environment had no `GEMINI_API_KEY`, and the requirement is to check real generated output against its real inputs. Do not fill this in with invented results.

## Procedure
1. After the deployed service has run a few hourly collections, connect to the production database (or run locally with a real key: `npm run collect`).
2. List stories with stored analyses: `node scripts/export-summary.js`
3. Pick three multi-publisher stories, ideally at least one with "supported" perspectives and one with "insufficient evidence".
4. Export each: `node scripts/export-summary.js <storyId> > review-1.md`. This prints the exact feed excerpts given to the model next to the stored output and ref numbers.
5. For each sentence of the output, check that the cited refs actually say it. Record the results below.
6. If you find an unsupported claim, fix it for the release candidate (for example tighten [summary_system.md](../server/prompts/summary_system.md), bump `prompt_version` in [model_config.json](../server/prompts/model_config.json), and let the next run regenerate), then re-check and log it in [DEFECT_LOG.md](DEFECT_LOG.md).

## Review template (copy per story)

### Story N: \<headline\>
- Story ID / analysis version / generated at:
- Inputs: [1] publisher, title · [2] ... (attach the export)

| Output statement | Cited refs | Supported by inputs? | Notes |
| --- | --- | --- | --- |
| Overview sentence 1 | [1, 2] | Yes / Partly / No | |
| ... | | | |

- **Unsupported claims:**
- **Missing context** (important facts in the inputs the output omitted):
- **Perspectives:** are they voiced in the coverage, or assigned from a publisher's reputation?
- **Corrections made:** (prompt change, version, re-check result)
