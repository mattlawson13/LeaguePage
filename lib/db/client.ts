import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), ".data", "league.db");
const SCHEMA_PATH = path.join(process.cwd(), "lib", "db", "schema.sql");

// Vercel's serverless functions run on a read-only filesystem — the ingest
// script never runs there. The DB is a committed, versioned snapshot
// (rebuilt locally by scripts/ingest.ts and pushed) rather than a live file
// the deployed app writes to, so on Vercel we must open it strictly
// read-only: no mkdir, no schema DDL, no journal file of any kind.
const READONLY = process.env.VERCEL === "1" || process.env.DB_READONLY === "1";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (READONLY) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `getDb: ${DB_PATH} not found in this deployment. The SQLite snapshot must be committed to the repo — ` +
          `run "npm run ingest:full" locally, commit .data/league.db, and redeploy.`,
      );
    }
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    db.pragma("foreign_keys = ON");
    return db;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  return db;
}
