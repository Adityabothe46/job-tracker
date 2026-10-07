import {
  getSearchPreferences,
  parseCommaList,
  parseWatchTimes,
} from "@/lib/search-preferences";
import { listEnabledWatchedBoards } from "@/lib/watched-boards";
import {
  createJob,
  findJobBySourceUrl,
  findJobByCompanyAndTitle,
  refreshPostedAt,
  isDismissed,
  listDismissedRoles,
  listTrackedCompanies,
  listTrackedRoles,
} from "@/lib/jobs";
import { getProfile } from "@/lib/profile";
import { extractDraftFromUrl } from "@/lib/extract";
import {
  startScanRun,
  finishScanRunOk,
  finishScanRunError,
  getLatestScanRun,
  getLatestScanRunForScope,
  recordScopeRun,
} from "@/lib/scan-runs";
import { fetchJobWatchListings } from "./job-watch";
import { isSeniorTitle } from "./seniority";
import { sendNewJobsDigest } from "./notify";
import { companyBoardsConnector } from "./company-boards";
import { linkedinConnector } from "./linkedin";
import { indeedConnector } from "./indeed";
import type { Connector, SearchCriteria } from "./types";
import type { Job, RawListing, ScanTrigger } from "@/types";
import type { JobWatchBatch } from "./job-watch";

// Below this length, a listing's description is treated as "just a
// snippet" (title-only, common for the generic/LinkedIn/Indeed connectors)
// and the ingestion step re-fetches the full posting page. Greenhouse/Lever
// descriptions are typically much longer and skip this re-fetch.
const SNIPPET_THRESHOLD_CHARS = 500;

function isFresh(listing: RawListing, freshnessHours: number): boolean {
  // No discoverable date -> can't filter by freshness; dedup against
  // already-tracked jobs is the practical proxy instead (see CLAUDE.md).
  if (!listing.postedAt) return true;
  const postedTime = new Date(listing.postedAt).getTime();
  if (Number.isNaN(postedTime)) return true;
  const ageMs = Date.now() - postedTime;
  return ageMs <= freshnessHours * 60 * 60 * 1000;
}

function matchesCriteria(listing: RawListing, criteria: SearchCriteria): boolean {
  const haystack = `${listing.title} ${listing.description}`.toLowerCase();

  const keywordOk =
    criteria.keywords.length === 0 ||
    criteria.keywords.some((k) => haystack.includes(k.toLowerCase()));

  const locationOk =
    criteria.locations.length === 0 ||
    criteria.locations.some((loc) => haystack.includes(loc.toLowerCase())) ||
    (criteria.remoteOk && haystack.includes("remote"));

  return keywordOk && locationOk;
}

/**
 * Turns one matched RawListing into a saved job. Returns null if it turns
 * out to be a duplicate (race against the pre-check) or the DB insert
 * otherwise fails. Discovered jobs are deliberately NOT auto-tailored (no
 * cover letter/resume bullets generated up front) — every generation is a
 * `claude` CLI call against the user's seat, so they're only made when the
 * user clicks Generate on a job they actually care about.
 */
async function ingestListing(listing: RawListing): Promise<Job | null> {
  return saveListing(listing, { refetchSnippet: true });
}

async function saveListing(
  listing: RawListing,
  options: { refetchSnippet: boolean; atTop?: boolean }
): Promise<Job | null> {
  let description = listing.description;

  if (options.refetchSnippet && description.length < SNIPPET_THRESHOLD_CHARS && listing.url) {
    try {
      const draft = await extractDraftFromUrl(listing.url);
      if (draft.description) description = draft.description;
    } catch {
      // Keep the snippet — common for LinkedIn/Indeed, which may block this
      // follow-up fetch too. A thin listing is still better than none.
    }
  }

  let job: Job;
  try {
    job = createJob({
      title: listing.title,
      company: listing.company,
      description,
      source_url: listing.url || null,
      status: "wishlist",
      discovered_via: listing.source,
      country: listing.country,
      posted_at: listing.postedAt,
      atTop: options.atTop,
    });
  } catch (err) {
    // Most likely the unique index on source_url (a duplicate slipped past
    // the pre-check due to a race) — treat as "already tracked", not fatal.
    console.error(
      "[scanner] Skipping listing, likely a duplicate:",
      err instanceof Error ? err.message : err
    );
    return null;
  }

  return job;
}

export async function runScanCycle(
  trigger: ScanTrigger
): Promise<{ scanRunIds: string[]; newJobsCount: number }> {
  const prefs = getSearchPreferences();
  const watchedBoards = listEnabledWatchedBoards();
  const criteria: SearchCriteria = {
    keywords: parseCommaList(prefs.keywords),
    locations: parseCommaList(prefs.locations),
    remoteOk: !!prefs.remote_ok,
    freshnessHours: prefs.freshness_hours,
    watchedBoards,
  };

  const enabledConnectors: Connector[] = [];
  if (prefs.source_company_boards_enabled && watchedBoards.length > 0) {
    enabledConnectors.push(companyBoardsConnector);
  }
  if (prefs.source_linkedin_enabled) enabledConnectors.push(linkedinConnector);
  if (prefs.source_indeed_enabled) enabledConnectors.push(indeedConnector);

  const scanRunIds: string[] = [];
  const newlyCreatedJobs: Job[] = [];

  for (const connector of enabledConnectors) {
    const runId = startScanRun(connector.source, trigger);
    scanRunIds.push(runId);

    try {
      const rawListings = await connector.fetchNewListings(criteria);
      const matched = rawListings.filter(
        (l) =>
          isFresh(l, criteria.freshnessHours) &&
          matchesCriteria(l, criteria) &&
          // Early-career user: never ingest senior/lead/level-III+ titles.
          !isSeniorTitle(l.title) &&
          // Never resurrect a posting the user deleted.
          !isDismissed(l.company, l.title, l.url)
      );

      let newCount = 0;
      for (const listing of matched) {
        if (!listing.url || findJobBySourceUrl(listing.url)) continue;

        const job = await ingestListing(listing);
        if (job) {
          newlyCreatedJobs.push(job);
          newCount++;
        }
      }

      finishScanRunOk(runId, rawListings.length, newCount);
    } catch (err) {
      finishScanRunError(runId, err instanceof Error ? err.message : String(err));
    }
  }

  if (newlyCreatedJobs.length > 0) {
    await sendNewJobsDigest(prefs.notification_email, newlyCreatedJobs);
  }

  return { scanRunIds, newJobsCount: newlyCreatedJobs.length };
}

// ---------------------------------------------------------------------------
// Job Watch — the Claude-web-search source (see ./job-watch.ts). Kept out of
// runScanCycle's hourly loop on purpose: one run is several parallel
// multi-minute CLI sessions. It runs when the board is opened/reloaded and
// the last successful run is older than search_preferences
// .job_watch_interval_hours (and from the hourly instrumentation timer, so a
// board left open keeps refreshing). "Refresh jobs" forces a run regardless.

// After a failed run, wait this long before an automatic retry so every page
// refresh doesn't relaunch a search that's failing for a persistent reason.
const JOB_WATCH_ERROR_BACKOFF_MS = 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __jobWatchRunning: boolean | undefined;
}

function sqliteUtcToDate(value: string): Date {
  return new Date(value.replace(" ", "T") + "Z");
}

/**
 * The most recent scheduled slot that has already passed today, as a local
 * Date — or null if none have (or no slots are configured).
 */
function lastElapsedSlot(times: string, now: Date): Date | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const elapsed = parseWatchTimes(times).filter((minutes) => minutes <= nowMinutes);
  if (elapsed.length === 0) return null;
  const latest = elapsed[elapsed.length - 1];
  const slot = new Date(now);
  slot.setHours(Math.floor(latest / 60), latest % 60, 0, 0);
  return slot;
}

export function isJobWatchRunning(): boolean {
  return !!global.__jobWatchRunning;
}

/**
 * Which schedules have fired and not yet been served. The US and the
 * international countries have separate daily times (e.g. 09:00 and 16:00),
 * so each is checked against its own last successful run.
 */
export function dueScopes(): JobWatchBatch[] {
  if (isJobWatchRunning()) return [];
  const prefs = getSearchPreferences();
  if (!prefs.job_watch_enabled) return [];

  // A scope is due once today's most recent slot for it has passed and no
  // successful run covering it has happened since. The app only runs while
  // it's open, so a slot missed overnight fires on the next open.
  const now = new Date();
  const scopes: JobWatchBatch[] = [];
  for (const [scope, times] of [
    ["home", prefs.job_watch_times],
    ["international", prefs.job_watch_times_intl],
  ] as [JobWatchBatch, string][]) {
    const slot = lastElapsedSlot(times, now);
    if (!slot) continue; // no slots configured, or none reached yet today
    const lastOk = getLatestScanRunForScope(scope);
    if (lastOk && sqliteUtcToDate(lastOk) >= slot) continue;
    scopes.push(scope);
  }
  if (scopes.length === 0) return [];

  const latest = getLatestScanRun("job_watch");
  if (latest?.status === "running") {
    // Nothing is running in this (the only) server process, so the row was
    // orphaned by the app closing mid-search — close it out and run again
    // rather than waiting it out.
    finishScanRunError(latest.id, "Interrupted — the app was closed mid-search.");
    return scopes;
  }
  if (latest?.status === "error" && !latest.error_message?.startsWith("Interrupted")) {
    const ageMs = Date.now() - sqliteUtcToDate(latest.started_at).getTime();
    if (ageMs < JOB_WATCH_ERROR_BACKOFF_MS) return [];
  }
  return scopes;
}

/** Convenience wrapper for callers that only need "is anything due?". */
export function isJobWatchDue(): boolean {
  return dueScopes().length > 0;
}

/**
 * Runs one Job Watch cycle: search, dedup against everything on the board
 * (by URL and by company+title, so already-applied roles never reappear),
 * save new finds to the top of Wishlist.
 */
export async function runJobWatch(
  trigger: ScanTrigger,
  scopes: JobWatchBatch[] = ["home", "international"]
): Promise<{ newJobsCount: number; errors: string[] }> {
  if (global.__jobWatchRunning) return { newJobsCount: 0, errors: ["Already running."] };
  if (scopes.length === 0) return { newJobsCount: 0, errors: [] };
  global.__jobWatchRunning = true;

  const runId = startScanRun("job_watch", trigger);
  const newJobs: Job[] = [];
  let result: { newJobsCount: number; errors: string[] };
  try {
    const prefs = getSearchPreferences();
    const { listings, errors } = await fetchJobWatchListings({
      prefs,
      profile: getProfile(),
      trackedCompanies: listTrackedCompanies(),
      trackedRoles: listTrackedRoles(),
      dismissedRoles: listDismissedRoles(),
      scopes,
    });

    // Priority-company finds go in last so they end up on top of Wishlist.
    const isPriority = (l: (typeof listings)[number]) =>
      l.description.startsWith("⭐ Priority");
    const ordered = [...listings.filter((l) => !isPriority(l)), ...listings.filter(isPriority)];

    for (const listing of ordered) {
      // The user deleted this posting before — don't bring it back.
      if (isDismissed(listing.company, listing.title, listing.url)) continue;
      const existing =
        findJobBySourceUrl(listing.url) ??
        findJobByCompanyAndTitle(listing.company, listing.title);
      if (existing) {
        // A hidden (undated/old) Job Watch find seen again with a fresh date
        // comes back onto the board; anything else is a genuine duplicate.
        const newer =
          listing.postedAt &&
          (!existing.posted_at || Date.parse(listing.postedAt) > Date.parse(existing.posted_at));
        if (existing.discovered_via === "job_watch" && newer) {
          refreshPostedAt(existing.id, listing.postedAt!);
        }
        continue;
      }
      const job = await saveListing(listing, { refetchSnippet: false, atTop: true });
      if (job) newJobs.push(job);
    }

    if (errors.length) {
      console.error("[job-watch] Some searches failed:", errors.join(" | "));
    }
    finishScanRunOk(runId, listings.length, newJobs.length);
    recordScopeRun(scopes);
    if (newJobs.length > 0) await sendNewJobsDigest(prefs.notification_email, newJobs);
    result = { newJobsCount: newJobs.length, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishScanRunError(runId, message);
    result = { newJobsCount: 0, errors: [message] };
  } finally {
    global.__jobWatchRunning = false;
  }
  return result;
}
