// Small database layer that runs the same SQL on Postgres (production) and on
// SQLite (local development and tests). SQL is written with $1, $2 ...
// placeholders; for SQLite they are rewritten to ?1, ?2 ... which SQLite
// supports natively. All timestamps are stored as ISO-8601 UTC strings so they
// sort and compare identically in both engines.
import fs from "node:fs";
import path from "node:path";
import { config, ROOT_DIR } from "./config.js";

const schemaSql = fs.readFileSync(path.join(ROOT_DIR, "src", "schema.sql"), "utf8");

function cleanParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

async function openPostgres(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 5
  });

  const wrap = (runner) => ({
    kind: "postgres",
    async all(sql, params = []) {
      return (await runner.query(sql, cleanParams(params))).rows;
    },
    async get(sql, params = []) {
      return (await runner.query(sql, cleanParams(params))).rows[0];
    },
    async run(sql, params = []) {
      const result = await runner.query(sql, cleanParams(params));
      return { changes: result.rowCount ?? 0 };
    },
    async exec(sql) {
      await runner.query(sql);
    }
  });

  const db = wrap(pool);
  db.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(wrap(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  db.close = () => pool.end();
  return db;
}

async function openSqlite(file) {
  const { DatabaseSync } = await import("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  if (file !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL;");
  const statements = new Map();
  const prepare = (sql) => {
    const converted = sql.replace(/\$(\d+)/g, "?$1");
    if (!statements.has(converted)) statements.set(converted, sqlite.prepare(converted));
    return statements.get(converted);
  };

  let depth = 0;
  const db = {
    kind: "sqlite",
    async all(sql, params = []) {
      return prepare(sql).all(...cleanParams(params));
    },
    async get(sql, params = []) {
      return prepare(sql).get(...cleanParams(params));
    },
    async run(sql, params = []) {
      const result = prepare(sql).run(...cleanParams(params));
      return { changes: Number(result.changes) };
    },
    async exec(sql) {
      sqlite.exec(sql);
    },
    async tx(fn) {
      // SQLite has one connection; nested calls join the outer transaction.
      if (depth > 0) return fn(db);
      depth += 1;
      sqlite.exec("BEGIN");
      try {
        const result = await fn(db);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close() {
      sqlite.close();
    }
  };
  return db;
}

export async function openDb(options = {}) {
  const url = options.databaseUrl ?? config.databaseUrl;
  const db = url ? await openPostgres(url) : await openSqlite(options.sqlitePath ?? config.sqlitePath);
  await migrate(db);
  return db;
}

export async function migrate(db) {
  const statements = schemaSql
    .split(";")
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.exec(statement);
  }
}
