import { JSDOM } from "jsdom";
import type { RawListing } from "@/types";
import type { Connector, SearchCriteria } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 JobTracker/1.0";

/**
 * Best-effort, unofficial. LinkedIn has no public job-search API for
 * unauthenticated tools like this one, and actively fights automated access
 * (CAPTCHAs, login walls, rate limiting/blocking non-browser traffic). This
 * connector fetches LinkedIn's public "guest" job search results page and
 * heuristically parses job cards — it will frequently get a login/challenge
 * page instead of real results, especially on repeated hourly requests.
 * When that happens it returns an empty array rather than throwing; the
 * caller records that as a scan_runs error so the failure is visible in the
 * UI instead of silently invisible. Expect this to need occasional
 * maintenance (or to just stop working) as LinkedIn's page structure changes
 * — that's the nature of unofficial scraping, not a bug to chase.
 */
// LinkedIn's own bot-detection status code, in addition to the usual ones.
const BOT_DETECTION_STATUSES = new Set([401, 403, 429, 999]);

class BlockedError extends Error {}

async function fetchListings(keywords: string, location: string): Promise<string> {
  const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
  url.searchParams.set("keywords", keywords);
  if (location) url.searchParams.set("location", location);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (BOT_DETECTION_STATUSES.has(res.status)) {
      throw new BlockedError(`LinkedIn returned HTTP ${res.status} (bot detection)`);
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
    lowered.includes("id=\"captcha") ||
    lowered.includes("authwall") ||
    lowered.includes("join now to see") ||
    !lowered.includes("job-search-card")
  );
}

function parseRelativeDate(text: string): string | null {
  const match = text.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const msPerUnit: Record<string, number> = {
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
  };
  const ms = amount * (msPerUnit[unit] ?? 0);
  if (!ms) return null;
  return new Date(Date.now() - ms).toISOString();
}

export const linkedinConnector: Connector = {
  source: "linkedin",
  async fetchNewListings(criteria: SearchCriteria): Promise<RawListing[]> {
    const results: RawListing[] = [];
    const locations = criteria.locations.length ? criteria.locations : [""];
    let blockedCount = 0;
    let attemptCount = 0;

    for (const keyword of criteria.keywords) {
      for (const location of locations) {
        attemptCount++;
        try {
          const html = await fetchListings(keyword, location);
          if (looksLikeChallengePage(html)) {
            blockedCount++;
            console.error(
              `[linkedin] Got a login/challenge page for "${keyword}" in "${location}" — skipping.`
            );
            continue;
          }

          const dom = new JSDOM(html);
          const cards = Array.from(
            dom.window.document.querySelectorAll(".job-search-card")
          );
          for (const card of cards) {
            const title =
              card.querySelector(".base-search-card__title")?.textContent?.trim() ?? "";
            const company =
              card.querySelector(".base-search-card__subtitle")?.textContent?.trim() ?? "";
            const link = card.querySelector("a.base-card__full-link");
            const href = link?.getAttribute("href") ?? "";
            const dateText =
              card.querySelector("time")?.textContent?.trim() ?? "";
            if (!title || !href) continue;

            results.push({
              title,
              company,
              // Embed the location we searched with — otherwise the
              // scanner's location text-match filter (which checks the
              // title+description) has nothing to match against and
              // silently rejects every result, even though the search
              // itself was already location-scoped.
              description: (location ? `Location: ${location}\n\n` : "") + title,
              url: href.split("?")[0],
              postedAt: parseRelativeDate(dateText),
              source: "linkedin",
            });
          }
        } catch (err) {
          if (err instanceof BlockedError) blockedCount++;
          console.error(
            `[linkedin] Search failed for "${keyword}" in "${location}":`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    if (results.length === 0 && blockedCount > 0 && blockedCount === attemptCount) {
      throw new Error(
        `LinkedIn returned a login/challenge page for all ${attemptCount} search(es) this cycle — likely rate-limited or blocked, not genuinely zero matches.`
      );
    }

    return results;
  },
};
