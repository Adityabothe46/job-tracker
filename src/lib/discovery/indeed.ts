import { JSDOM } from "jsdom";
import type { RawListing } from "@/types";
import type { Connector, SearchCriteria } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 JobTracker/1.0";
// HTTP statuses Indeed/Cloudflare commonly return for bot-detected traffic —
// confirmed via direct testing: a plain server-side fetch gets a 401
// "Authenticating..." bot-detection redirect page, not a normal 200 response.
const BOT_DETECTION_STATUSES = new Set([401, 403, 429, 999]);

/**
 * Best-effort, unofficial — same caveats as linkedin.ts. Indeed has no
 * public unauthenticated search API (their real Job Search API requires a
 * publisher/partner agreement this personal tool doesn't have), so this
 * scrapes the public search results HTML, which Indeed frequently protects
 * with Cloudflare-style challenge pages/bot-detection redirects for
 * non-browser traffic, and whose markup/class names change periodically
 * without notice. Expect this connector to break sometimes and need
 * selector maintenance — that's inherent to unofficial scraping, not a bug
 * to chase. `fromage=N` (days) conveniently maps directly to the freshness
 * window when Indeed honors it.
 */
class BlockedError extends Error {}

async function fetchListings(
  keywords: string,
  location: string,
  freshnessDays: number
): Promise<string> {
  const url = new URL("https://www.indeed.com/jobs");
  url.searchParams.set("q", keywords);
  if (location) url.searchParams.set("l", location);
  url.searchParams.set("fromage", String(Math.max(1, freshnessDays)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (BOT_DETECTION_STATUSES.has(res.status)) {
      throw new BlockedError(`Indeed returned HTTP ${res.status} (bot detection)`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeChallengePage(html: string): boolean {
  const lowered = html.toLowerCase();
  return (
    lowered.includes("cf-browser-verification") ||
    lowered.includes("additional verification required") ||
    (!lowered.includes("jobsearch-serpjobcard") && !lowered.includes("job_seen_beacon"))
  );
}

export const indeedConnector: Connector = {
  source: "indeed",
  async fetchNewListings(criteria: SearchCriteria): Promise<RawListing[]> {
    const results: RawListing[] = [];
    const locations = criteria.locations.length ? criteria.locations : [""];
    const freshnessDays = Math.max(1, Math.ceil(criteria.freshnessHours / 24));
    let blockedCount = 0;
    let attemptCount = 0;

    for (const keyword of criteria.keywords) {
      for (const location of locations) {
        attemptCount++;
        try {
          const html = await fetchListings(keyword, location, freshnessDays);
          if (looksLikeChallengePage(html)) {
            blockedCount++;
            console.error(
              `[indeed] Got a challenge/verification page for "${keyword}" in "${location}" — skipping.`
            );
            continue;
          }

          const dom = new JSDOM(html);
          const cards = Array.from(
            dom.window.document.querySelectorAll(".job_seen_beacon, .jobsearch-SerpJobCard")
          );
          for (const card of cards) {
            const titleEl = card.querySelector("h2.jobTitle a, a.jobtitle");
            const title = titleEl?.textContent?.trim() ?? "";
            const company =
              card.querySelector(".companyName, .company")?.textContent?.trim() ?? "";
            const href = titleEl?.getAttribute("href") ?? "";
            if (!title || !href) continue;

            results.push({
              title,
              company,
              description: (location ? `Location: ${location}\n\n` : "") + title,
              url: new URL(href, "https://www.indeed.com").toString(),
              postedAt: null, // Indeed's relative-date text is unreliable to parse; rely on dedup instead.
              source: "indeed",
            });
          }
        } catch (err) {
          if (err instanceof BlockedError) blockedCount++;
          console.error(
            `[indeed] Search failed for "${keyword}" in "${location}":`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    // If every attempt this cycle got blocked and nothing came through, make
    // that visible as a scan error rather than an indistinguishable "0
    // results" — the two mean very different things to the user.
    if (results.length === 0 && blockedCount > 0 && blockedCount === attemptCount) {
      throw new Error(
        `Indeed blocked all ${attemptCount} search(es) this cycle (bot detection) — ` +
          `likely rate-limited or blocked, not genuinely zero matches.`
      );
    }

    return results;
  },
};
