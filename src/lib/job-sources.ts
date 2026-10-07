// Tells a company's own careers site apart from job boards / aggregators, so
// the board can prefer career-site postings (the user's stated preference).
// Dependency-free: used by both the server (Wishlist ordering in jobs.ts) and
// the browser (card labels).

/** Hostname suffix → display name for known job boards and re-posters. */
export const JOB_BOARDS: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "simplyhired.com": "SimplyHired",
  "indeed.com": "Indeed",
  "glassdoor.com": "Glassdoor",
  "ziprecruiter.com": "ZipRecruiter",
  "builtin.com": "Built In",
  "builtinboston.com": "Built In",
  "jooble.org": "Jooble",
  "talent.com": "Talent.com",
  "monster.com": "Monster",
  "careerbuilder.com": "CareerBuilder",
  "dice.com": "Dice",
  "lensa.com": "Lensa",
  "jobright.ai": "Jobright",
  "workopia.io": "Workopia",
  "bebee.com": "BeBee",
  "jobleads.com": "JobLeads",
  "whatjobs.com": "WhatJobs",
  "himalayas.app": "Himalayas",
  "wayup.com": "WayUp",
  "freehire.me": "Freehire",
  "zapply.jobs": "Zapply",
  "snagajob.com": "Snagajob",
  "adzuna.com": "Adzuna",
  "handshake.com": "Handshake",
  "joinhandshake.com": "Handshake",
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Display name of the job board a URL is on, or null if it isn't one. */
export function jobBoardName(url: string | null | undefined): string | null {
  const host = url ? hostnameOf(url) : null;
  if (!host) return null;
  for (const [domain, name] of Object.entries(JOB_BOARDS)) {
    if (host === domain || host.endsWith("." + domain)) return name;
  }
  return null;
}

/**
 * SQL expression that is 1 when `jobs.source_url` is on a known job board —
 * used to rank career-site postings first within the same posting day.
 * Built only from the fixed domain list above (never user input).
 */
export const JOB_BOARD_URL_SQL = `(CASE WHEN ${Object.keys(JOB_BOARDS)
  .map((domain) => `jobs.source_url LIKE '%${domain}/%'`)
  .join(" OR ")} THEN 1 ELSE 0 END)`;
