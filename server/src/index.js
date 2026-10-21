import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./api.js";
import { runCollection } from "./collector.js";

const db = await openDb();
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`My News API listening on port ${config.port} (${db.kind} database, AI model ${config.aiModel})`);
});

// Optional in-process hourly schedule (only for hosts that never sleep).
if (config.enableInternalScheduler) {
  const runScheduled = async () => {
    try {
      const result = await runCollection(db, { trigger: "internal" });
      console.log(`Scheduled collection: ${result.skipped ? `skipped (${result.reason})` : result.status}`);
    } catch (error) {
      console.error("Scheduled collection crashed", error);
    }
  };
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(5, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  setTimeout(() => {
    runScheduled();
    setInterval(runScheduled, 3_600_000);
  }, next - now);
  console.log(`Internal scheduler enabled; first run at ${next.toISOString()}`);
}
