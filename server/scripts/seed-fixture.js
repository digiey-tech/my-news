// Loads the clearly labeled FIXTURE dataset (fictional stories) into a
// separate local SQLite database for demonstrating difficult grouping cases.
// It never touches the production database.
//   npm run seed:fixture            -> data/fixture.db
//   then: SQLITE_PATH=./data/fixture.db npm start
import path from "node:path";
import { ROOT_DIR } from "../src/config.js";
import { openDb } from "../src/db.js";
import { runCollection } from "../src/collector.js";
import { fixture, makeWorld } from "../test/helpers.js";

const file = path.join(ROOT_DIR, "data", "fixture.db");
const db = await openDb({ databaseUrl: "", sqlitePath: file });
const now = new Date();
const world = makeWorld(
  fixture.articles.map((article) => ({ ...article, publisher: `${article.publisher} [FIXTURE]` })),
  now
);
// Fixture stories never get AI text, so nothing fabricated is labeled AI-generated.
const noAi = async () => {
  throw new Error("AI is not run for fixture data");
};
const result = await runCollection(db, {
  trigger: "cli",
  deps: { feeds: world.feeds(), fetchFeed: world.fetchFeed, findBackground: async () => [], generateAnalysis: noAi }
});
console.log(`${fixture.label}\nSeeded ${file}: ${result.articles_new} articles, ${result.stories_created} stories.`);
await db.close();
