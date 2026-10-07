-- Job Application Tracker schema.
-- Single-user, local SQLite database. Run once on startup by scripts/init-db.ts.
-- NOTE: this file is applied idempotently via CREATE TABLE/INDEX IF NOT EXISTS
-- on every startup. It is NOT re-run against a pre-existing `jobs` table's
-- columns (SQLite has no "ADD COLUMN IF NOT EXISTS") — new nullable columns
-- on existing tables are upgraded in place by scripts/init-db.ts instead, so
-- existing data is never wiped. See that file for the guarded ALTER TABLE.

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ensure the single profile row always exists so the app can always UPDATE it.
INSERT OR IGNORE INTO profile (id, resume_text) VALUES (1, '');

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  source_url TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'wishlist'
    CHECK (status IN ('wishlist', 'referral', 'applied', 'interviewing', 'offer', 'rejected')),
  position INTEGER NOT NULL DEFAULT 0,
  -- How this job entered the tracker: NULL for manually-added jobs, or the
  -- source connector that discovered it. Set by the discovery scanner only.
  discovered_via TEXT
    CHECK (discovered_via IS NULL OR discovered_via IN ('company_boards', 'linkedin', 'indeed', 'job_watch')),
  -- Best-effort inferred posting date from the source, for display only —
  -- NULL when the source didn't expose a parseable date.
  posted_at TEXT,
  -- KPI tracking (see src/lib/jobs.ts): first time the job reached Applied or
  -- a later stage (cleared if moved back to Wishlist), and last status change.
  applied_at TEXT,
  status_changed_at TEXT,
  -- Which country's board the job belongs to (header country picker).
  country TEXT NOT NULL DEFAULT 'United States',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Dedup key for the discovery scanner: a posting URL should only ever exist
-- once. Partial index so the many existing/manual jobs with source_url IS
-- NULL (paste-text path) don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_url_unique
  ON jobs(source_url) WHERE source_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('cover_letter', 'resume_bullets', 'interview_questions', 'company_brief')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, type)
);

CREATE INDEX IF NOT EXISTS idx_generations_job ON generations(job_id);

-- Search/discovery preferences: single row, same pattern as `profile`.
CREATE TABLE IF NOT EXISTS search_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  keywords TEXT NOT NULL DEFAULT '',           -- comma-separated title/keyword terms
  locations TEXT NOT NULL DEFAULT '',          -- comma-separated location strings
  remote_ok INTEGER NOT NULL DEFAULT 1,        -- 0/1 boolean
  freshness_hours INTEGER NOT NULL DEFAULT 48,
  notification_email TEXT NOT NULL DEFAULT '',
  source_company_boards_enabled INTEGER NOT NULL DEFAULT 1,
  source_linkedin_enabled INTEGER NOT NULL DEFAULT 0,
  source_indeed_enabled INTEGER NOT NULL DEFAULT 0,
  -- job_watch_* columns are added (and seeded with defaults) by
  -- scripts/init-db.ts, not here — see that file.
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO search_preferences (id) VALUES (1);

-- Company career pages the discovery scanner should poll.
CREATE TABLE IF NOT EXISTS watched_boards (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  board_type TEXT NOT NULL
    CHECK (board_type IN ('greenhouse', 'lever', 'generic')),
  board_identifier TEXT NOT NULL,   -- Greenhouse/Lever slug, or a full URL for 'generic'
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per source per scan cycle, so failures in one source (e.g.
-- LinkedIn getting blocked) are visible without affecting the others.
CREATE TABLE IF NOT EXISTS scan_runs (
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
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_started ON scan_runs(started_at);

-- Jobs the user deleted. Discovery (Job Watch + the hourly connectors) skips
-- anything matching these by URL or by normalized company+title, so a role
-- the user removed (no sponsorship, too senior, ...) never comes back.
-- Re-adding the job manually clears its entry (see POST /api/jobs).
CREATE TABLE IF NOT EXISTS dismissed_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  country TEXT,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dismissed_jobs_url ON dismissed_jobs(source_url);

-- Last successful Job Watch run per scope ("home" / "international"), which
-- have separate daily schedules (search_preferences.job_watch_times and
-- job_watch_times_intl). Kept out of scan_runs so a single run row can cover
-- either or both scopes.
CREATE TABLE IF NOT EXISTS scope_runs (
  scope TEXT PRIMARY KEY,
  last_ok_at TEXT NOT NULL
);
