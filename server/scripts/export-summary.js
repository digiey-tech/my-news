// Prints a stored AI analysis next to the exact inputs it was generated from,
// for the manual review in docs/AI_REVIEW.md. Read-only; never calls the model.
//   node scripts/export-summary.js            -> lists stories that have analyses
//   node scripts/export-summary.js <storyId>  -> prints inputs + analysis as Markdown
import { openDb } from "../src/db.js";

const db = await openDb();
const storyId = process.argv[2];

if (!storyId) {
  const rows = await db.all(
    `SELECT s.id, s.headline, su.version, su.generated_at, su.payload FROM summaries su JOIN stories s ON s.id = su.story_id
     WHERE su.payload IS NOT NULL ORDER BY su.generated_at DESC LIMIT 40`
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload);
    console.log(`${row.id}  refs=${payload.references.length}  perspectives=${payload.perspectives.length}  ${row.headline}`);
  }
  process.exit(0);
}

const story = await db.get("SELECT * FROM stories WHERE id = $1", [storyId]);
const summary = await db.get("SELECT * FROM summaries WHERE story_id = $1", [storyId]);
if (!story || !summary?.payload) {
  console.error("No stored analysis for that story.");
  process.exit(1);
}
const payload = JSON.parse(summary.payload);
const ids = JSON.parse(summary.article_ids);
const articles = new Map((await db.all("SELECT * FROM articles WHERE story_id = $1", [storyId])).map((a) => [a.id, a]));

const out = [];
out.push(`## ${story.headline}`, "", `Story \`${story.id}\` · analysis version ${summary.version} · generated ${summary.generated_at} · model ${summary.model} · prompt ${summary.prompt_version}`, "");
out.push("### Inputs (feed excerpts, original wording)", "");
ids.forEach((id, i) => {
  const a = articles.get(id);
  out.push(a ? `**[${i + 1}] ${a.publisher}**, ${a.published_at}: *${a.title}*  \n${a.excerpt || "(no excerpt)"}  \n<${a.url}>` : `**[${i + 1}]** (article no longer stored)`, "");
});
const refs = (list) => (list?.length ? ` [${list.join(", ")}]` : "");
out.push("### AI output", "");
out.push(`**Overview:** ${payload.overview}${refs(payload.overview_refs)}`, "");
out.push(`**Agreement:** ${payload.agreement}${refs(payload.agreement_refs)}`, "");
out.push(`**Disagreement:** ${payload.disagreement}${refs(payload.disagreement_refs)}`, "");
out.push(`**Uncertainty:** ${payload.uncertainty}`, "");
if (payload.perspectives_status !== "supported") out.push("**Perspectives:** Insufficient evidence for distinct perspectives.", "");
for (const p of payload.perspectives) out.push(`**Perspective: ${p.name}**: ${p.summary}${refs(p.refs)}  \n*Limits:* ${p.evidence_limits}`, "");
console.log(out.join("\n"));
await db.close();
