import { JSDOM } from "jsdom";
import type { RawListing } from "@/types";
import type { Connector, SearchCriteria } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 JobTracker/1.0";
// Small gap between per-board requests so a long watched-boards list doesn't
// burst many simultaneous requests at once (mostly a courtesy — Greenhouse/
// Lever are public APIs meant for this, but there's no reason to hammer them).
const BOARD_FETCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  const dom = new JSDOM(`<div>${html}</div>`);
  return dom.window.document.body.textContent?.trim() ?? "";
}

async function fetchGreenhouse(slug: string): Promise<RawListing[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`
  )) as { jobs?: Array<Record<string, unknown>> };

  return (data.jobs ?? []).map((job) => {
    const location = (job.location as { name?: string } | undefined)?.name ?? "";
    return {
      title: String(job.title ?? "Untitled role"),
      company: slug,
      description:
        (location ? `Location: ${location}\n\n` : "") + stripHtml(String(job.content ?? "")),
      url: String(job.absolute_url ?? ""),
      postedAt:
        (job.updated_at as string | undefined) ??
        (job.first_published as string | undefined) ??
        null,
      source: "company_boards" as const,
    };
  });
}

async function fetchLever(slug: string): Promise<RawListing[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  )) as Array<Record<string, unknown>>;

  return (Array.isArray(data) ? data : []).map((posting) => {
    const createdAt = posting.createdAt as number | undefined;
    const location =
      (posting.categories as { location?: string } | undefined)?.location ?? "";
    return {
      title: String(posting.text ?? "Untitled role"),
      company: slug,
      description:
        (location ? `Location: ${location}\n\n` : "") +
        String(posting.descriptionPlain ?? stripHtml(String(posting.description ?? ""))),
      url: String(posting.hostedUrl ?? ""),
      postedAt: createdAt ? new Date(createdAt).toISOString() : null,
      source: "company_boards" as const,
    };
  });
}

/**
 * Best-effort fallback for company career pages that aren't Greenhouse or
 * Lever. Rather than trying to LLM-parse an arbitrary listing page (fragile,
 * and would give every listing the same base-page URL, breaking dedup), this
 * scrapes real `<a>` links off the raw page and heuristically keeps ones
 * that look like job postings. It only produces {title, url} — no
 * description or posting date — the ingestion pipeline re-fetches the full
 * posting page for any listing that only has a snippet, reusing the existing
 * Readability+claude extraction pipeline (see src/lib/extract.ts).
 */
async function fetchGeneric(
  companyName: string,
  boardUrl: string
): Promise<RawListing[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(boardUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const dom = new JSDOM(html, { url: boardUrl });
  const anchors = Array.from(dom.window.document.querySelectorAll("a[href]"));
  const jobLikePattern = /job|career|position|opening|posting|req/i;
  const seen = new Set<string>();
  const listings: RawListing[] = [];

  for (const a of anchors) {
    const text = a.textContent?.trim() ?? "";
    const href = a.getAttribute("href") ?? "";
    if (!text || text.length < 4 || text.length > 150) continue;
    if (!jobLikePattern.test(href) && !jobLikePattern.test(a.className ?? "")) continue;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, boardUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);

    listings.push({
      title: text,
      company: companyName,
      description: text,
      url: absoluteUrl,
      postedAt: null,
      source: "company_boards",
    });

    if (listings.length >= 50) break; // cap to avoid pathological pages
  }

  return listings;
}

export const companyBoardsConnector: Connector = {
  source: "company_boards",
  async fetchNewListings(criteria: SearchCriteria): Promise<RawListing[]> {
    const results: RawListing[] = [];

    for (const board of criteria.watchedBoards) {
      try {
        let listings: RawListing[];
        if (board.board_type === "greenhouse") {
          listings = await fetchGreenhouse(board.board_identifier);
        } else if (board.board_type === "lever") {
          listings = await fetchLever(board.board_identifier);
        } else {
          listings = await fetchGeneric(board.company_name, board.board_identifier);
        }
        // Prefer the configured company name for display over API-derived slugs.
        results.push(
          ...listings.map((l) => ({ ...l, company: board.company_name || l.company }))
        );
      } catch (err) {
        // One board failing shouldn't stop the others — the scanner logs
        // source-level (not per-board) status, so surface this via console
        // for now; per-board granularity can be added later if needed.
        console.error(
          `[company-boards] Failed to fetch board "${board.company_name}" (${board.board_type}):`,
          err instanceof Error ? err.message : err
        );
      }
      await sleep(BOARD_FETCH_DELAY_MS);
    }

    return results;
  },
};
