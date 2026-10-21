// Runs one collection directly against the configured database.
//   npm run collect
import { openDb } from "../src/db.js";
import { runCollection } from "../src/collector.js";

const db = await openDb();
const result = await runCollection(db, { trigger: "cli" });
console.log(JSON.stringify(result, null, 2));
await db.close();
process.exit(result.status === "failed" ? 1 : 0);
