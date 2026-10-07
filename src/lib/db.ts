// Singleton connection using Node's built-in `node:sqlite` module (stable
// since Node 22.5+ — no native compilation/build-tools required, unlike
// `better-sqlite3`). Shared across API routes within the same Next.js server
// process. `scripts/init-db.ts` (run via the predev/prebuild npm hooks) is
// responsible for creating the file and applying schema.sql; this module
// just opens the existing file.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = path.join(process.cwd(), "data", "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __appDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  const conn = new DatabaseSync(dbPath);
  conn.exec("PRAGMA journal_mode = WAL");
  conn.exec("PRAGMA foreign_keys = ON");
  return conn;
}

// Reuse the connection across hot-reloads in dev instead of opening a new
// file handle on every request.
export const db = global.__appDb ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  global.__appDb = db;
}
