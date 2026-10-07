import { db } from "./db";
import type { SearchPreferences } from "@/types";

export function getSearchPreferences(): SearchPreferences {
  return db
    .prepare(`SELECT * FROM search_preferences WHERE id = 1`)
    .get() as unknown as SearchPreferences;
}

export interface SaveSearchPreferencesInput {
  keywords: string;
  locations: string;
  remote_ok: boolean;
  freshness_hours: number;
  notification_email: string;
  source_company_boards_enabled: boolean;
  source_linkedin_enabled: boolean;
  source_indeed_enabled: boolean;
  job_watch_enabled: boolean;
  job_watch_priority_companies: string;
  job_watch_companies: string;
  job_watch_roles: string;
  daily_goal: number;
  job_watch_countries: string;
  job_watch_times: string;
  job_watch_times_intl: string;
}

export function saveSearchPreferences(
  input: SaveSearchPreferencesInput
): SearchPreferences {
  db.prepare(
    `UPDATE search_preferences
     SET keywords = @keywords,
         locations = @locations,
         remote_ok = @remote_ok,
         freshness_hours = @freshness_hours,
         notification_email = @notification_email,
         source_company_boards_enabled = @source_company_boards_enabled,
         source_linkedin_enabled = @source_linkedin_enabled,
         source_indeed_enabled = @source_indeed_enabled,
         job_watch_enabled = @job_watch_enabled,
         job_watch_priority_companies = @job_watch_priority_companies,
         job_watch_companies = @job_watch_companies,
         job_watch_roles = @job_watch_roles,
         daily_goal = @daily_goal,
         job_watch_countries = @job_watch_countries,
         job_watch_times = @job_watch_times,
         job_watch_times_intl = @job_watch_times_intl,
         updated_at = datetime('now')
     WHERE id = 1`
  ).run({
    keywords: input.keywords,
    locations: input.locations,
    remote_ok: input.remote_ok ? 1 : 0,
    freshness_hours: input.freshness_hours,
    notification_email: input.notification_email,
    source_company_boards_enabled: input.source_company_boards_enabled ? 1 : 0,
    source_linkedin_enabled: input.source_linkedin_enabled ? 1 : 0,
    source_indeed_enabled: input.source_indeed_enabled ? 1 : 0,
    job_watch_enabled: input.job_watch_enabled ? 1 : 0,
    job_watch_priority_companies: input.job_watch_priority_companies,
    job_watch_companies: input.job_watch_companies,
    job_watch_roles: input.job_watch_roles,
    daily_goal: input.daily_goal,
    job_watch_countries: input.job_watch_countries,
    job_watch_times: input.job_watch_times,
    job_watch_times_intl: input.job_watch_times_intl,
  });
  return getSearchPreferences();
}

/** Parses a newline-separated list field (the job_watch_* textareas). */
export function parseLineList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parses the comma-separated `keywords`/`locations` text fields into arrays. */
export function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses `job_watch_times` ("09:00,14:00") into minutes-after-midnight,
 * sorted and de-duplicated. Garbage entries are dropped rather than throwing.
 */
export function parseWatchTimes(value: string): number[] {
  const minutes = value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d{1,2}):?(\d{2})$/);
      if (!match) return null;
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    })
    .filter((n): n is number => n !== null);
  return [...new Set(minutes)].sort((a, b) => a - b);
}

/** Canonical "HH:MM,HH:MM" form for storage, from free-form user input. */
export function normalizeTimes(value: string): string {
  return parseWatchTimes(value)
    .map((total) => {
      const h = String(Math.floor(total / 60)).padStart(2, "0");
      const m = String(total % 60).padStart(2, "0");
      return `${h}:${m}`;
    })
    .join(",");
}
