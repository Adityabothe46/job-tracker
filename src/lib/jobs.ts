import { randomUUID } from "node:crypto";
import { db } from "./db";
import { APPLIED_STATUSES, type DiscoverySource, type Job, type JobStatus } from "@/types";
import { HOME_COUNTRY, JOB_WATCH_MAX_AGE_DAYS } from "./discovery/job-watch-defaults";
import { JOB_BOARD_URL_SQL } from "./job-sources";
import { isSeniorTitle } from "./discovery/seniority";

// A Job Watch find still sitting in Wishlist whose posting is undated or older
// than JOB_WATCH_MAX_AGE_DAYS is treated as stale: hidden from the board (not
// deleted), and not offered to Job Watch as "already tracked" so a fresh
// sighting of the same role can bring it back with a real date. Anything the
// user has moved past Wishlist is never hidden.
// `IS`, not `=`: manual jobs have discovered_via NULL, and `NULL = 'job_watch'`
// is NULL — which made NOT(...) NULL too and silently hid every manually
// added Wishlist job. Manual jobs are never subject to the age rule.
const STALE_JOB_WATCH_SQL = `(jobs.status = 'wishlist' AND jobs.discovered_via IS 'job_watch'
  AND (jobs.posted_at IS NULL
       OR julianday(jobs.posted_at) < julianday('now', '-${JOB_WATCH_MAX_AGE_DAYS} days')))`;

/**
 * Job Watch finds still in Wishlist with a senior/lead/level-III+ title are
 * hidden too (the user can't apply to them yet). Checked in JS rather than SQL
 * — see isSeniorTitle. Like stale finds: hidden, not deleted.
 */
function isHiddenSeniorFind(job: Pick<Job, "status" | "discovered_via" | "title">): boolean {
  // Any auto-discovered source (Job Watch, LinkedIn, Indeed, company boards) —
  // only jobs the user added themselves are exempt.
  return job.status === "wishlist" && !!job.discovered_via && isSeniorTitle(job.title);
}

/** True if this job exists but listJobs() leaves it off the board. */
export function isHiddenFromBoard(id: string): boolean {
  const row = db
    .prepare(`SELECT jobs.*, ${STALE_JOB_WATCH_SQL} AS stale FROM jobs WHERE id = ?`)
    .get(id) as unknown as (Job & { stale: number }) | undefined;
  return !!row && (!!row.stale || isHiddenSeniorFind(row));
}

/**
 * Turns a Job Watch find into a manual job (the user added it themselves), so
 * the age/seniority hiding rules no longer apply to it.
 */
export function claimAsManual(id: string): void {
  db.prepare(`UPDATE jobs SET discovered_via = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function listJobs(): Job[] {
  // Wishlist is ordered newest posting day first (falling back to when the
  // job was added, for manual jobs) so fresh openings sit on top; within the
  // same day, company career-site postings rank above job-board ones (the
  // user's preference). Applied is alphabetical by company (A→Z, then title).
  // The other columns keep their drag-and-drop order.
  return db
    .prepare(
      `SELECT jobs.*,
              EXISTS(SELECT 1 FROM generations WHERE generations.job_id = jobs.id) AS has_generations
       FROM jobs
       WHERE NOT ${STALE_JOB_WATCH_SQL}
       ORDER BY status,
                CASE WHEN status = 'wishlist'
                     THEN date(COALESCE(posted_at, created_at)) END DESC,
                CASE WHEN status = 'wishlist' THEN ${JOB_BOARD_URL_SQL} END ASC,
                CASE WHEN status = 'wishlist'
                     THEN julianday(COALESCE(posted_at, created_at)) END DESC,
                CASE WHEN status = 'applied' THEN TRIM(company) END COLLATE NOCASE ASC,
                CASE WHEN status = 'applied' THEN title END COLLATE NOCASE ASC,
                position ASC`
    )
    .all()
    .filter((job) => !isHiddenSeniorFind(job as unknown as Job)) as unknown as Job[];
}

export function getJob(id: string): Job | undefined {
  return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as unknown as
    | Job
    | undefined;
}

/** Used by the discovery scanner to dedup against previously-seen postings. */
export function findJobBySourceUrl(sourceUrl: string): Job | undefined {
  return db
    .prepare(`SELECT * FROM jobs WHERE source_url = ?`)
    .get(sourceUrl) as unknown as Job | undefined;
}

/** Lowercased, punctuation-stripped form used for fuzzy company/title dedup. */
function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|usa)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Discovery dedup for sources without stable URLs (Job Watch results can
 * point at different mirrors of the same posting on different days): true if
 * the tracker already has a job whose normalized company AND title match —
 * including manually-added ones, so an already-applied role never comes back
 * into Wishlist.
 */
export function findJobByCompanyAndTitle(company: string, title: string): Job | undefined {
  const companyKey = normalizeKey(company);
  const titleKey = normalizeTitle(title);
  if (!titleKey) return undefined;
  const rows = db.prepare(`SELECT * FROM jobs`).all() as unknown as Job[];
  return rows.find((row) => {
    const rowCompany = normalizeKey(row.company);
    const companyMatches =
      rowCompany === companyKey ||
      (!!rowCompany && !!companyKey &&
        (rowCompany.startsWith(companyKey) || companyKey.startsWith(rowCompany)));
    return companyMatches && normalizeTitle(row.title) === titleKey;
  });
}

/**
 * Title key for dedup: like normalizeKey, but also drops decorations that
 * vary between sightings of the same posting — experience notes like
 * "(4+ yrs)", work-mode notes like "(Remote)", and requisition codes like
 * "AMZ26152.4" / "CVG100". Location parentheticals are kept (a different
 * city is usually a genuinely different opening).
 */
function normalizeTitle(title: string): string {
  return normalizeKey(
    title
      .replace(/\([^)]*\b(yrs?|years?|exp\w*|remote|hybrid|on-?site)\b[^)]*\)/gi, " ")
      .replace(/\b[a-z]{2,5}\d[\w.]*\b/gi, " ")
  );
}

/**
 * Records a (newer) posting date on an existing job — used when Job Watch
 * re-finds a stale/undated find, which un-hides it on the board.
 */
export function refreshPostedAt(id: string, postedAt: string): void {
  db.prepare(`UPDATE jobs SET posted_at = ?, updated_at = datetime('now') WHERE id = ?`).run(
    postedAt,
    id
  );
}

/** Distinct company names across every job on the board, for Job Watch. */
export function listTrackedCompanies(country: string = HOME_COUNTRY): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT TRIM(company) AS company FROM jobs WHERE TRIM(company) != '' AND country = ?`
    )
    .all(country) as unknown as { company: string }[];
  return rows.map((r) => r.company);
}

/** Every tracked "company — title" pair, so Job Watch can skip known roles. */
export function listTrackedRoles(): string[] {
  const rows = db
    .prepare(
      `SELECT company, title FROM jobs WHERE NOT ${STALE_JOB_WATCH_SQL} ORDER BY created_at DESC`
    )
    .all() as unknown as { company: string; title: string }[];
  return rows.map((r) => `${r.company || "?"} — ${r.title}`);
}

/**
 * KPI bookkeeping for a status change: stamps status_changed_at, sets
 * applied_at the first time the job reaches an APPLIED_STATUSES stage, and
 * clears it if the job goes back to Wishlist (treated as "never applied").
 */
function recordStatusChange(id: string, status: JobStatus): void {
  db.prepare(
    `UPDATE jobs
     SET status_changed_at = datetime('now'),
         applied_at = CASE
           WHEN @applied = 1 THEN COALESCE(applied_at, datetime('now'))
           WHEN @status = 'wishlist' THEN NULL
           ELSE applied_at
         END
     WHERE id = @id`
  ).run({ id, status, applied: APPLIED_STATUSES.includes(status) ? 1 : 0 });
}

function nextPosition(status: JobStatus): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS maxPos FROM jobs WHERE status = ?`
    )
    .get(status) as unknown as { maxPos: number };
  return row.maxPos + 1;
}

export interface CreateJobInput {
  title: string;
  company: string;
  description: string;
  source_url?: string | null;
  status?: JobStatus;
  /** Set only by the discovery scanner; omitted (NULL) for manually-added jobs. */
  discovered_via?: DiscoverySource | null;
  posted_at?: string | null;
  /** Insert at the top of its column instead of the bottom (Job Watch). */
  atTop?: boolean;
  /** Board country; defaults to HOME_COUNTRY. */
  country?: string;
}

export function createJob(input: CreateJobInput): Job {
  const id = randomUUID();
  const status = input.status ?? "wishlist";
  let position: number;
  if (input.atTop) {
    db.prepare(`UPDATE jobs SET position = position + 1 WHERE status = ?`).run(status);
    position = 0;
  } else {
    position = nextPosition(status);
  }
  db.prepare(
    `INSERT INTO jobs (id, title, company, source_url, description, status, position, discovered_via, posted_at, country)
     VALUES (@id, @title, @company, @source_url, @description, @status, @position, @discovered_via, @posted_at, @country)`
  ).run({
    id,
    title: input.title,
    company: input.company,
    source_url: input.source_url ?? null,
    description: input.description,
    status,
    position,
    discovered_via: input.discovered_via ?? null,
    posted_at: input.posted_at ?? null,
    country: input.country?.trim() || HOME_COUNTRY,
  });
  // Adding a job straight into Applied (etc.) counts as applying today.
  recordStatusChange(id, status);
  return getJob(id)!;
}

export interface UpdateJobInput {
  title?: string;
  company?: string;
  description?: string;
  status?: JobStatus;
  position?: number;
  country?: string;
}

export function updateJob(id: string, input: UpdateJobInput): Job | undefined {
  const existing = getJob(id);
  if (!existing) return undefined;

  const next = { ...existing, ...input };
  // Only pass the exact named parameters the query references — unlike
  // better-sqlite3, node:sqlite's named-parameter binding throws
  // ("Unknown named parameter") if the object has extra keys the SQL
  // doesn't use, so spreading the full `next` object directly would fail.
  db.prepare(
    `UPDATE jobs
     SET title = @title,
         company = @company,
         description = @description,
         status = @status,
         position = @position,
         country = @country,
         updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id: next.id,
    title: next.title,
    company: next.company,
    description: next.description,
    status: next.status,
    position: next.position,
    country: next.country?.trim() || HOME_COUNTRY,
  });
  if (next.status !== existing.status) recordStatusChange(id, next.status);
  return getJob(id);
}

/**
 * Moves a job to a status column at a specific index and re-numbers the
 * `position` of every job in the affected column(s) so ordering stays
 * contiguous. Simple full re-index — fine at personal-tracker scale.
 */
export function moveJob(id: string, status: JobStatus, index: number): void {
  const job = getJob(id);
  if (!job) return;

  const fromStatus = job.status;

  // node:sqlite's DatabaseSync has no built-in `.transaction()` helper (unlike
  // better-sqlite3), so BEGIN/COMMIT/ROLLBACK are managed by hand here.
  db.exec("BEGIN");
  try {
    // Pull every job in the destination column (excluding the moving job),
    // splice it back in at `index`, then rewrite positions 0..n-1.
    const destJobs = (
      db
        .prepare(
          `SELECT id FROM jobs WHERE status = ? AND id != ? ORDER BY position ASC`
        )
        .all(status, id) as unknown as { id: string }[]
    ).map((r) => r.id);

    const clampedIndex = Math.max(0, Math.min(index, destJobs.length));
    destJobs.splice(clampedIndex, 0, id);

    // Renumbering only touches `position` — updated_at is bumped for the moved
    // job alone, so it stays meaningful for the other cards in the column.
    const update = db.prepare(`UPDATE jobs SET status = ?, position = ? WHERE id = ?`);
    destJobs.forEach((jobId, i) => update.run(status, i, jobId));
    db.prepare(`UPDATE jobs SET updated_at = datetime('now') WHERE id = ?`).run(id);
    if (fromStatus !== status) recordStatusChange(id, status);

    // If the job moved out of its old column, close the gap it left behind.
    if (fromStatus !== status) {
      const remaining = (
        db
          .prepare(
            `SELECT id FROM jobs WHERE status = ? ORDER BY position ASC`
          )
          .all(fromStatus) as unknown as { id: string }[]
      ).map((r) => r.id);
      remaining.forEach((jobId, i) => update.run(fromStatus, i, jobId));
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Deleting a job also remembers it in `dismissed_jobs`, so discovery never
 * re-adds it (the user deletes for a reason: no sponsorship, too senior,
 * citizens-only). Adding the same job back manually clears the entry.
 */
export function deleteJob(id: string): void {
  const job = getJob(id);
  if (job) {
    db.prepare(
      `INSERT INTO dismissed_jobs (company, title, source_url, country)
       VALUES (@company, @title, @source_url, @country)`
    ).run({
      company: job.company,
      title: job.title,
      source_url: job.source_url,
      country: job.country,
    });
  }
  db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
}

/** Deletes several jobs, each recorded in `dismissed_jobs` like a single delete. */
export function deleteJobs(ids: string[]): number {
  let deleted = 0;
  db.exec("BEGIN");
  try {
    for (const id of ids) {
      if (getJob(id)) {
        deleteJob(id);
        deleted++;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return deleted;
}

interface DismissedRow {
  company: string;
  title: string;
  source_url: string | null;
}

function dismissedRows(): DismissedRow[] {
  return db
    .prepare(`SELECT company, title, source_url FROM dismissed_jobs`)
    .all() as unknown as DismissedRow[];
}

/** True if the user previously deleted this posting (by URL or company+title). */
export function isDismissed(
  company: string,
  title: string,
  sourceUrl?: string | null
): boolean {
  const companyKey = normalizeKey(company);
  const titleKey = normalizeTitle(title);
  return dismissedRows().some((row) => {
    if (sourceUrl && row.source_url && row.source_url === sourceUrl) return true;
    if (!titleKey) return false;
    const rowCompany = normalizeKey(row.company);
    const companyMatches =
      rowCompany === companyKey ||
      (!!rowCompany &&
        !!companyKey &&
        (rowCompany.startsWith(companyKey) || companyKey.startsWith(rowCompany)));
    return companyMatches && normalizeTitle(row.title) === titleKey;
  });
}

/** Forgets a dismissal — called when the user adds the same job back by hand. */
export function undismiss(company: string, title: string, sourceUrl?: string | null): void {
  const companyKey = normalizeKey(company);
  const titleKey = normalizeTitle(title);
  const ids = (
    db.prepare(`SELECT id, company, title, source_url FROM dismissed_jobs`).all() as unknown as
      (DismissedRow & { id: number })[]
  )
    .filter((row) => {
      if (sourceUrl && row.source_url && row.source_url === sourceUrl) return true;
      if (!titleKey) return false;
      const rowCompany = normalizeKey(row.company);
      const companyMatches =
        rowCompany === companyKey ||
        (!!rowCompany &&
          !!companyKey &&
          (rowCompany.startsWith(companyKey) || companyKey.startsWith(rowCompany)));
      return companyMatches && normalizeTitle(row.title) === titleKey;
    })
    .map((row) => row.id);
  const stmt = db.prepare(`DELETE FROM dismissed_jobs WHERE id = ?`);
  for (const id of ids) stmt.run(id);
}

/** "Company — Title" lines for the Job Watch prompt's do-not-suggest list. */
export function listDismissedRoles(limit = 120): string[] {
  const rows = db
    .prepare(
      `SELECT company, title FROM dismissed_jobs ORDER BY dismissed_at DESC LIMIT ?`
    )
    .all(limit) as unknown as { company: string; title: string }[];
  return rows.map((r) => `${r.company || "?"} — ${r.title}`);
}
