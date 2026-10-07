/**
 * SQLite's datetime('now') stores "YYYY-MM-DD HH:MM:SS" in UTC with no
 * timezone marker — normalize to ISO-8601 so Date parses it as UTC rather
 * than (incorrectly) as local time.
 */
export function parseSqliteDate(sqliteDate: string): Date {
  return new Date(sqliteDate.replace(" ", "T") + "Z");
}

export function timeAgo(sqliteDate: string): string {
  const diffMs = Date.now() - parseSqliteDate(sqliteDate).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Hours elapsed since a SQLite datetime('now') timestamp. */
export function hoursSince(sqliteDate: string): number {
  return (Date.now() - parseSqliteDate(sqliteDate).getTime()) / (1000 * 60 * 60);
}

/**
 * Freshness of a posting date (ISO string): whole days old, counted in local
 * calendar days so a posting dated today reads "today" all day.
 */
export function postedDaysAgo(isoDate: string): number {
  const posted = new Date(isoDate);
  // Exactly-UTC-midnight values are date-only postings ("2026-09-28") that
  // were stored as UTC — read their calendar date in UTC, or west-of-UTC
  // timezones would show them as posted the day before.
  const dateOnly = /T00:00:00(\.000)?Z$/.test(isoDate);
  const postedDay = dateOnly
    ? new Date(posted.getUTCFullYear(), posted.getUTCMonth(), posted.getUTCDate())
    : new Date(posted.getFullYear(), posted.getMonth(), posted.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - postedDay.getTime()) / 86_400_000));
}

export function postedLabel(isoDate: string): string {
  const days = postedDaysAgo(isoDate);
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  return `Posted ${days} days ago`;
}
