// Bootstraps data/app.db from db/schema.sql if it doesn't exist yet, and
// applies the schema (idempotent via IF NOT EXISTS) on every run so new
// tables/indexes added later are picked up without a separate migration step.
//
// SQLite has no "ADD COLUMN IF NOT EXISTS", so schema.sql alone can't add new
// nullable columns to a `jobs` table that already exists from a previous run
// (CREATE TABLE IF NOT EXISTS is a no-op there). Any such columns are instead
// upgraded in place below via a guarded ALTER TABLE, so existing rows/data
// are never wiped.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_JOB_WATCH_COMPANIES,
  DEFAULT_JOB_WATCH_COUNTRIES,
  HOME_COUNTRY,
  DEFAULT_JOB_WATCH_PRIORITY_COMPANIES,
  DEFAULT_JOB_WATCH_ROLES,
} from "../src/lib/discovery/job-watch-defaults";

const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const dbPath = path.join(dataDir, "app.db");
const schemaPath = path.join(projectRoot, "db", "schema.sql");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const schema = fs.readFileSync(schemaPath, "utf-8");
const dbExisted = fs.existsSync(dbPath);

/**
 * Logs a schema-migration step, but only when migrating a database that
 * already existed. On a first run every guarded ALTER below fires at once
 * while the schema is built from nothing, and printing a dozen "upgraded"
 * lines makes a healthy first start look like something went wrong.
 */
function migrationLog(message: string): void {
  if (dbExisted) console.log(message);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec(schema);

// Guarded column upgrade for `jobs` (discovery feature). Each entry is added
// only if missing, so this is safe to run on every startup and never
// destructive to existing data.
const jobsColumns = (db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]).map(
  (c) => c.name
);
const columnUpgrades: { name: string; ddl: string }[] = [
  {
    name: "discovered_via",
    ddl: `ALTER TABLE jobs ADD COLUMN discovered_via TEXT
      CHECK (discovered_via IS NULL OR discovered_via IN ('company_boards', 'linkedin', 'indeed', 'job_watch'))`,
  },
  { name: "posted_at", ddl: "ALTER TABLE jobs ADD COLUMN posted_at TEXT" },
  // KPI tracking: when the job first reached Applied (or later), and when its
  // status last changed. Maintained by moveJob/updateJob in src/lib/jobs.ts.
  { name: "applied_at", ddl: "ALTER TABLE jobs ADD COLUMN applied_at TEXT" },
  { name: "status_changed_at", ddl: "ALTER TABLE jobs ADD COLUMN status_changed_at TEXT" },
  // Which country's board the job belongs to (the header's country picker).
  {
    name: "country",
    ddl: `ALTER TABLE jobs ADD COLUMN country TEXT NOT NULL DEFAULT '${HOME_COUNTRY}'`,
  },
];
const hadCountry = jobsColumns.includes("country");
const hadAppliedAt = jobsColumns.includes("applied_at");

for (const { name, ddl } of columnUpgrades) {
  if (!jobsColumns.includes(name)) {
    db.exec(ddl);
    migrationLog(`Upgraded jobs table: added column "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// Job Watch upgrade: the `job_watch` discovery source has to be allowed by the
// CHECK constraints on jobs.discovered_via and scan_runs.source. SQLite can't
// ALTER a CHECK constraint, so a table created before this existed is rebuilt
// (create new -> copy rows -> drop old -> rename), after backing up the DB
// file. Guarded by inspecting the stored CREATE TABLE text, so it only ever
// runs once per database.
function tableSql(name: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string } | undefined;
  return row?.sql ?? "";
}

// Also rebuilt when the status CHECK predates the 'referral' column.
const jobsSql = tableSql("jobs");
const needsJobsRebuild = !jobsSql.includes("job_watch") || !jobsSql.includes("'referral'");
const needsScanRunsRebuild = !tableSql("scan_runs").includes("job_watch");

if (needsJobsRebuild || needsScanRunsRebuild) {
  if (dbExisted) {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(dataDir, `app.backup-${stamp}.db`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Backed up database to ${backupPath} before table upgrade`);
  }

  // generations.job_id REFERENCES jobs(id) ON DELETE CASCADE — foreign keys
  // must be off while the old jobs table is dropped, or every saved
  // generation would be cascade-deleted with it.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    if (needsJobsRebuild) {
      db.exec(`CREATE TABLE jobs_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        source_url TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'wishlist'
          CHECK (status IN ('wishlist', 'referral', 'applied', 'interviewing', 'offer', 'rejected')),
        position INTEGER NOT NULL DEFAULT 0,
        discovered_via TEXT
          CHECK (discovered_via IS NULL OR discovered_via IN ('company_boards', 'linkedin', 'indeed', 'job_watch')),
        posted_at TEXT,
        applied_at TEXT,
        status_changed_at TEXT,
        country TEXT NOT NULL DEFAULT '${HOME_COUNTRY}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      // Every column exists on the old table by now (the guarded ALTERs above
      // ran first), so all of them are copied across.
      const cols =
        "id, title, company, source_url, description, status, position, discovered_via, " +
        "posted_at, applied_at, status_changed_at, country, created_at, updated_at";
      db.exec(`INSERT INTO jobs_new (${cols}) SELECT ${cols} FROM jobs`);
      db.exec("DROP TABLE jobs");
      db.exec("ALTER TABLE jobs_new RENAME TO jobs");
      migrationLog("Upgraded jobs table: allowed status 'referral' and discovered_via 'job_watch'");
    }

    if (needsScanRunsRebuild) {
      db.exec(`CREATE TABLE scan_runs_new (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
        source TEXT NOT NULL
          CHECK (source IN ('company_boards', 'linkedin', 'indeed', 'job_watch')),
        status TEXT NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'ok', 'error')),
        listings_found INTEGER NOT NULL DEFAULT 0,
        listings_new INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      )`);
      db.exec(`INSERT INTO scan_runs_new SELECT
        id, started_at, finished_at, trigger_type, source, status, listings_found, listings_new, error_message
        FROM scan_runs`);
      db.exec("DROP TABLE scan_runs");
      db.exec("ALTER TABLE scan_runs_new RENAME TO scan_runs");
      migrationLog("Upgraded scan_runs table: allowed source = 'job_watch'");
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }

  // Dropping the old tables dropped their indexes too — re-apply the schema
  // (all IF NOT EXISTS) to recreate them.
  db.exec(schema);
}

// One-time KPI backfill when applied_at is first introduced: there's no record
// of when past applications happened, so use the date each job was added to
// the tracker (usually close — jobs tend to be logged when applying). NOT
// updated_at: moveJob used to bump it on every job in a column whenever any
// card was dropped there, so it doesn't reflect real activity.
if (!hadAppliedAt) {
  db.exec(`UPDATE jobs SET applied_at = created_at
           WHERE applied_at IS NULL AND status IN ('applied', 'interviewing', 'offer', 'rejected')`);
  db.exec(`UPDATE jobs SET status_changed_at = created_at WHERE status_changed_at IS NULL`);
  migrationLog("Backfilled applied_at/status_changed_at from created_at");
}

// One-time country backfill: existing jobs default to the home country, except
// ones whose title names a default international country, e.g. "Supply Chain
// Engineer (Netherlands)".
if (!hadCountry) {
  const tag = db.prepare(`UPDATE jobs SET country = ? WHERE title LIKE ?`);
  for (const country of DEFAULT_JOB_WATCH_COUNTRIES.split("\n")) {
    tag.run(country, `%${country}%`);
  }
  migrationLog("Backfilled jobs.country");
}

// Job Watch settings columns on the singleton search_preferences row. Seeded
// with defaults only at the moment each column is first added, so later
// edits from Settings are never overwritten.
const prefsColumns = (
  db.prepare("PRAGMA table_info(search_preferences)").all() as { name: string }[]
).map((c) => c.name);
const prefsUpgrades: { name: string; ddl: string; seed: string | number }[] = [
  {
    // Comma-separated local HH:MM times the international searches run at.
    name: "job_watch_times_intl",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_times_intl TEXT NOT NULL DEFAULT ''",
    seed: "",
  },
  {
    // Comma-separated local HH:MM times the US search runs at (see dueScopes).
    name: "job_watch_times",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_times TEXT NOT NULL DEFAULT ''",
    seed: "",
  },
  {
    name: "job_watch_countries",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_countries TEXT NOT NULL DEFAULT ''",
    seed: DEFAULT_JOB_WATCH_COUNTRIES,
  },
  {
    name: "daily_goal",
    ddl: "ALTER TABLE search_preferences ADD COLUMN daily_goal INTEGER NOT NULL DEFAULT 15",
    seed: 15,
  },
  {
    name: "job_watch_enabled",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_enabled INTEGER NOT NULL DEFAULT 1",
    seed: 1,
  },
  {
    name: "job_watch_priority_companies",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_priority_companies TEXT NOT NULL DEFAULT ''",
    seed: DEFAULT_JOB_WATCH_PRIORITY_COMPANIES,
  },
  {
    name: "job_watch_companies",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_companies TEXT NOT NULL DEFAULT ''",
    seed: DEFAULT_JOB_WATCH_COMPANIES,
  },
  {
    name: "job_watch_roles",
    ddl: "ALTER TABLE search_preferences ADD COLUMN job_watch_roles TEXT NOT NULL DEFAULT ''",
    seed: DEFAULT_JOB_WATCH_ROLES,
  },
];

for (const { name, ddl, seed } of prefsUpgrades) {
  if (!prefsColumns.includes(name)) {
    db.exec(ddl);
    // Column name comes from the fixed list above, never user input.
    db.prepare(`UPDATE search_preferences SET ${name} = ? WHERE id = 1`).run(seed);
    migrationLog(`Upgraded search_preferences table: added column "${name}"`);
  }
}

// job_watch_interval_hours was replaced by job_watch_times (scheduled daily
// slots). Dropping it is cosmetic, so a SQLite build without DROP COLUMN just
// leaves the unused column in place.
if (prefsColumns.includes("job_watch_interval_hours")) {
  try {
    db.exec("ALTER TABLE search_preferences DROP COLUMN job_watch_interval_hours");
    migrationLog("Dropped obsolete search_preferences.job_watch_interval_hours");
  } catch (err) {
    migrationLog(
      "Left obsolete job_watch_interval_hours in place: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

db.close();

console.log(
  dbExisted
    ? `Database ready at ${dbPath}`
    : `Created a new database at ${dbPath}`
);
