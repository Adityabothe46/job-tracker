import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { DiscoverySource, ScanRun, ScanTrigger } from "@/types";

/** Inserts a `running` row for one source at the start of its scan attempt. */
export function startScanRun(source: DiscoverySource, trigger: ScanTrigger): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO scan_runs (id, trigger_type, source, status)
     VALUES (@id, @trigger_type, @source, 'running')`
  ).run({ id, trigger_type: trigger, source });
  return id;
}

export function finishScanRunOk(
  id: string,
  listingsFound: number,
  listingsNew: number
): void {
  db.prepare(
    `UPDATE scan_runs
     SET status = 'ok', listings_found = @listings_found, listings_new = @listings_new,
         finished_at = datetime('now')
     WHERE id = @id`
  ).run({ id, listings_found: listingsFound, listings_new: listingsNew });
}

export function finishScanRunError(id: string, errorMessage: string): void {
  db.prepare(
    `UPDATE scan_runs
     SET status = 'error', error_message = @error_message, finished_at = datetime('now')
     WHERE id = @id`
  ).run({ id, error_message: errorMessage });
}

export function listRecentScanRuns(limit = 20): ScanRun[] {
  return db
    .prepare(`SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as unknown as ScanRun[];
}

/** Most recent run for one source, optionally only runs with a given status. */
export function getLatestScanRun(
  source: DiscoverySource,
  status?: ScanRun["status"]
): ScanRun | undefined {
  return (
    status
      ? db
          .prepare(
            `SELECT * FROM scan_runs WHERE source = ? AND status = ? ORDER BY started_at DESC LIMIT 1`
          )
          .get(source, status)
      : db
          .prepare(`SELECT * FROM scan_runs WHERE source = ? ORDER BY started_at DESC LIMIT 1`)
          .get(source)
  ) as unknown as ScanRun | undefined;
}

/**
 * Last successful run time (SQLite UTC datetime) for one Job Watch scope, or
 * undefined if it has never completed. Scopes have independent schedules.
 */
export function getLatestScanRunForScope(scope: string): string | undefined {
  const row = db
    .prepare(`SELECT last_ok_at FROM scope_runs WHERE scope = ?`)
    .get(scope) as { last_ok_at: string } | undefined;
  return row?.last_ok_at;
}

/** Marks these scopes as having just completed successfully. */
export function recordScopeRun(scopes: string[]): void {
  const stmt = db.prepare(
    `INSERT INTO scope_runs (scope, last_ok_at) VALUES (?, datetime('now'))
     ON CONFLICT(scope) DO UPDATE SET last_ok_at = datetime('now')`
  );
  for (const scope of scopes) stmt.run(scope);
}
