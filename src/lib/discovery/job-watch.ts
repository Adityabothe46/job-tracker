import { runClaudePrompt } from "@/lib/claude-cli";
import { parseLineList } from "@/lib/search-preferences";
import {
  GRADUATION_TERM,
  HOME_COUNTRY,
  JOB_WATCH_MAX_AGE_DAYS,
  REQUIRES_SPONSORSHIP,
} from "./job-watch-defaults";
import { isSeniorTitle } from "./seniority";
import type { Profile, RawListing, SearchPreferences } from "@/types";

/**
 * Job Watch: instead of scraping specific boards (which LinkedIn/Indeed and
 * most corporate career sites block), this hands a search brief to the local
 * `claude` CLI with its WebSearch/WebFetch tools enabled and asks for strict
 * JSON back. It runs as three parallel batches so one slow/failed batch
 * doesn't sink the others:
 *   1. priority companies (searched most thoroughly, wider role net),
 *   2. target companies + broad nationwide searches,
 *   3. every company already on the board (so companies the user has applied
 *      to keep getting watched for new openings).
 * Dedup against the board happens in the scanner, not here — the prompt's
 * "already tracked" list only reduces how much the model re-reports.
 */

// Larger daily target → longer searches; still bounded per batch.
const BATCH_TIMEOUT_MS = 20 * 60 * 1000;
// Phrases meaning the employer won't sponsor a work visa.
const NO_SPONSORSHIP_TEXT =
  /\b(no|not|unable to|will not|won'?t|cannot|does not)\b[^.]{0,40}\bsponsor|without (the need for )?sponsorship|u\.?s\.? citizens? only|must be a u\.?s\.? citizen|u\.?s\.? citizenship (is )?required|security clearance|itar|green card holders? only/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESUME_CHARS = 6000;
const MAX_TRACKED_ROLES = 300;
const MAX_DISMISSED_ROLES = 120;
// Home-country volume target per run. Some finds are then dropped as
// duplicates/senior/too old, so this is an ask, not a guarantee.
const HOME_TARGET = 25;
// Only a rotating slice of the (long) target list is searched each run, so
// results aren't dominated by the same few employers every time.
const TARGETS_PER_RUN = 18;
// ≈15 postings/day for each international country (one batch per country).
const INTERNATIONAL_TARGET = 15;
// Max CLI sessions running at once (US batches + one per country).
const MAX_PARALLEL_BATCHES = 4;
const MAX_TRACKED_COMPANIES = 40;
const WEB_TOOLS = ["WebSearch", "WebFetch"];

export type JobWatchBatch = "home" | "international";

interface JobWatchFinding {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  url?: unknown;
  posted?: unknown;
  level?: unknown;
  sponsorship?: unknown;
  why?: unknown;
  summary?: unknown;
}

export interface JobWatchListing extends RawListing {
  batch: JobWatchBatch;
}

export interface JobWatchResult {
  listings: JobWatchListing[];
  errors: string[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n...[truncated]";
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Work-authorization rule for one country, used when REQUIRES_SPONSORSHIP is
 * on. Written for a candidate who needs an employer to sponsor a work visa in
 * every market they search, which is the common case for an international
 * student or anyone job-hunting outside their country of citizenship.
 */
function visaRule(country: string): string {
  if (!REQUIRES_SPONSORSHIP) {
    return `- WORK AUTHORIZATION: no special filtering needed.`;
  }
  if (country === HOME_COUNTRY) {
    return `- VISA SPONSORSHIP: the candidate needs employer visa sponsorship (a student work
  permit now, a longer-term work visa later). SKIP postings that say they will not sponsor
  ("no sponsorship", "must be authorized to work without sponsorship now or in the
  future"), that require citizenship or permanent residency, or that require a security
  clearance / export-control status (most defense and government-contractor roles). Prefer
  employers with a track record of sponsoring. Report what the posting says in "sponsorship".`;
  }
  const routes: Record<string, string> = {
    Netherlands:
      "an IND-recognised sponsor hiring under the Highly Skilled Migrant (kennismigrant) scheme or EU Blue Card",
    Luxembourg: "an employer able to sponsor an EU Blue Card / salaried-worker permit",
    Germany: "an employer hiring via EU Blue Card or skilled-worker visa",
    Ireland: "an employer able to obtain a Critical Skills or General Employment Permit",
    Belgium: "an employer able to obtain a single permit / EU Blue Card",
    "United Kingdom": "a Home Office licensed Skilled Worker visa sponsor",
    "New Zealand": "an Immigration NZ accredited employer (Accredited Employer Work Visa)",
    "United Arab Emirates": "an employer that provides the employment visa (standard in the UAE)",
  };
  const route = routes[country] ?? `an employer able to sponsor a work permit in ${country}`;
  return `- WORK PERMIT: the candidate has no existing right to work in
  ${country}, so the employer must sponsor — ideally ${route}. SKIP postings that say
  "EU/EEA citizens only", "must already have the right to work", "no visa sponsorship", or
  that require local citizenship or a security clearance. Prefer international employers
  and roles where English is the working language; SKIP roles requiring fluency in a
  local language (e.g. Dutch, German, French, Arabic) unless English-only is clearly OK.
  Report what the posting says in "sponsorship".`;
}

function sharedContext(
  profile: Profile,
  roles: string[],
  trackedRoles: string[],
  dismissedRoles: string[],
  country: string = HOME_COUNTRY
): string {
  const resume = profile.resume_text.trim()
    ? truncate(profile.resume_text, MAX_RESUME_CHARS)
    : "(No resume saved — assume an entry-level industrial / supply chain engineer.)";

  const today = localIsoDate(new Date());
  const cutoff = localIsoDate(new Date(Date.now() - JOB_WATCH_MAX_AGE_DAYS * DAY_MS));
  const where =
    country === HOME_COUNTRY
      ? "the United States (any US location, plus US-remote)"
      : `${country} (any location in ${country}; remote only if based in ${country})`;

  return `You are a job-search assistant. Use the WebSearch tool (and WebFetch on promising
result or careers pages) to find CURRENTLY OPEN job postings in ${where}
that fit the candidate below.

TODAY IS ${today}. ONLY include postings POSTED ON OR AFTER ${cutoff} (the last
${JOB_WATCH_MAX_AGE_DAYS} days) — older postings are usually closed and must be left out.
Prioritize the newest: postings from the last 24 hours first, then the last week.
Every result needs its posting date as an exact "YYYY-MM-DD" — convert relative dates
("Posted 3 days ago", "30+ days ago" = too old) using today's date. If you cannot find
when a posting was published, DO NOT include it.

CANDIDATE RESUME:
"""
${resume}
"""

TARGET ROLE TYPES:
${bullets(roles)}

RULES:
- EARLY-CAREER ONLY: full-time roles for someone graduating around ${GRADUATION_TERM} —
  new grad, entry-level, associate, level I/II, or asking for at most ~3 years of
  experience. Co-ops/internships only if explicitly open to ${GRADUATION_TERM} graduates.
- NEVER include senior roles: skip any title containing Senior, Sr., Lead, Principal,
  Staff, Manager II/III, Director, Head of, Architect, or level III/IV/V, and skip any
  posting asking for 4+ years of experience — even at priority companies.
${visaRule(country)}
- Exclude: pure software-developer roles, hourly warehouse associate / technician roles,
  roles outside ${country === HOME_COUNTRY ? "the US" : country}.
- Only include postings you actually found in search results or on a page today, with a
  real URL to the posting. Never invent postings, URLs, or dates. Skip anything that looks
  closed or expired.
- SEARCH CAREER SITES FIRST: for every company you look at, start with its own careers
  site (e.g. WebSearch "site:<company careers domain> <role>" or "<company> careers
  <role>", or WebFetch its careers/search page). Only after that, use job boards to catch
  roles the career-site searches missed. Postings from anywhere are welcome — career
  sites just come first.
- LINKS MUST POINT TO THE COMPANY'S OWN CAREERS SITE whenever possible (its own
  careers subdomain, or its Workday/Greenhouse/Lever/iCIMS
  page). Job boards and aggregators (SimplyHired, Indeed, LinkedIn,
  Glassdoor, ZipRecruiter, Built In, Jooble, Talent.com, etc.) may be used to DISCOVER a
  role or to read its posting date, but then run a follow-up search like
  "<company> <exact job title> careers" to find the same posting on the company's site
  and use THAT url. Use a job-board url only if the company's own posting genuinely
  can't be found — and never use SimplyHired/Jooble/Talent.com-style re-posters when the
  original is findable.
- Company career sites often block fetches (403/404). If so, rely on search results or
  job-board copies and move on — don't spend long retrying.
- Skip roles already tracked by the candidate:
${bullets(trackedRoles.slice(0, MAX_TRACKED_ROLES)) || "- (none)"}
- NEVER suggest these again — the candidate explicitly removed them (not eligible, no
  sponsorship, too senior, or not interested). Skip these roles AND any near-identical
  posting of the same role at the same company:
${bullets(dismissedRoles.slice(0, MAX_DISMISSED_ROLES)) || "- (none)"}`;
}

const OUTPUT_FORMAT = `OUTPUT FORMAT — respond with ONLY this, no other text before or after:
<jobs>
[{"title": "...", "company": "...", "location": "City, ST or Remote",
  "url": "https://... (the company's own careers-site posting whenever it exists)",
  "posted": "YYYY-MM-DD (required — the date the posting went up)",
  "level": "strong" or "stretch",
  "sponsorship": "yes" (posting or employer clearly sponsors) or "unknown" (not stated),
  "why": "why it fits this candidate, max 15 words",
  "summary": "2-4 sentences: key duties and requirements from the posting"}]
</jobs>
"level": "strong" = new grad / entry-level / 0-2 yrs and closely matches;
"stretch" = asks ~2-3 yrs or has a skill gap.
VARIETY IS REQUIRED — the candidate's board is already dominated by a handful of employers:
- At most 3 postings from any single company in your whole answer.
- At least half of your results must be from companies that appear in NEITHER the lists
  above NOR the candidate's tracked roles — go find employers they haven't seen yet.
- Prefer a spread across industries (3PL, retail/grocery DC, e-commerce, manufacturing,
  medical devices, CPG, pharma distribution, automation vendors) over many roles at one
  big employer.
Never output a posting whose sponsorship would be "no" — leave it out entirely.
Sort the list newest posting first. If you find nothing, output <jobs>[]</jobs>.`;

/**
 * The single home-country batch: priority companies first, then target
 * companies, then broad nationwide searches. Merged into one CLI session
 * (it used to be three) — the old split re-searched the same companies in
 * each session, which cost the user's Claude seat without finding more jobs.
 */
function homePrompt(
  context: string,
  priority: string[],
  targets: string[],
  trackedCompanies: string[],
  roles: string[]
): string {
  // Companies already covered above are dropped so no company is searched twice.
  const firstWord = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0];
  const covered = new Set([...priority, ...targets].map(firstWord));
  const extras = trackedCompanies.filter((c) => !covered.has(firstWord(c)));

  return `${context}

TASK — work through these steps in order, in THIS one session. Search each company only
once; never repeat a query you have already run.

STEP 1 — PRIORITY COMPANIES (always check these). For each, run 2 WebSearch queries
(e.g. "<company> supply chain engineer job", "<company> careers industrial engineer").
For these use a WIDER net: any US role in engineering, supply chain, automation/robotics,
operations engineering, process improvement, analytics/BI, WMS, or project management —
still early-career only (no senior titles, at most ~3 years).
${bullets(priority)}

STEP 2 — BROAD DISCOVERY (spend most of your effort here). Run at least 8 varied
nationwide searches built from the target role types, aimed at surfacing employers the
candidate has NOT already seen — vary the wording, the industry and the region, e.g.
${bullets(discoveryQueries(roles))}
Resolve every job-board hit to the company's own careers posting.

STEP 3 — TARGET COMPANIES. A rotating sample this run (the full list is long, so a
different slice is checked each time — do NOT substitute other companies for these):
${bullets(targets)}${
    extras.length
      ? `

STEP 4 — only if you are still short, check these companies the candidate has already
applied to, for OTHER currently open roles:
${bullets(extras.slice(0, 10))}`
      : ""
  }

Aim for about ${HOME_TARGET} qualifying postings in total, from as many DIFFERENT
employers as possible. Stop once you reach it.

${OUTPUT_FORMAT}`;
}

/** One international country: its own search, ≈INTERNATIONAL_TARGET postings. */
function internationalPrompt(context: string, country: string, companies: string[]): string {
  return `${context}

TASK — ${country.toUpperCase()}. Find early-career roles located in ${country}.
1. Search the careers sites of international employers with operations in ${country} that
   hire for these role types — e.g. logistics/3PL, warehouse automation & robotics,
   e-commerce fulfillment, manufacturing and supply chain — including any of these that
   operate there:
${bullets(rotatingSample(companies.filter((c) => !c.startsWith("//")), 20))}
2. Then run at least 5 broad searches for the target role types in ${country} (English
   keywords, plus local-language job titles where common), aiming at employers the
   candidate has not already seen — not only the companies listed above.

Aim for about ${INTERNATIONAL_TARGET} qualifying postings for ${country}.

${OUTPUT_FORMAT}`;
}

/** Pulls the JSON array out of the model's reply, tolerating stray text. */
function parseFindings(reply: string): JobWatchFinding[] {
  const tagged = reply.match(/<jobs>([\s\S]*?)<\/jobs>/i);
  const candidates = tagged ? [tagged[1]] : [];
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(reply.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (Array.isArray(parsed)) return parsed as JobWatchFinding[];
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Job Watch reply didn't contain a parseable JSON job list.");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function localIsoDate(date: Date): string {
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD, local timezone
}

/**
 * Best-effort posting date → epoch ms, or null if unknowable. Accepts the
 * requested YYYY-MM-DD plus relative forms the model sometimes returns
 * anyway ("3 days ago", "today", "yesterday", "5 hours ago").
 */
function parsePostedDate(posted: string): number | null {
  const iso = posted.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    // Local midnight, not UTC, so "today" doesn't read as yesterday evening.
    const time = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
    return Number.isNaN(time) ? null : time;
  }
  const lowered = posted.toLowerCase();
  if (/\b(just now|today|hours? ago|minutes? ago)\b/.test(lowered)) return Date.now();
  if (/\byesterday\b/.test(lowered)) return Date.now() - DAY_MS;
  const relative = lowered.match(/(\d+)\+?\s*(day|week|month)s?\s*ago/);
  if (relative) {
    const unitDays = { day: 1, week: 7, month: 30 }[relative[2] as "day" | "week" | "month"];
    return Date.now() - Number(relative[1]) * unitDays * DAY_MS;
  }
  return null;
}

/** A rotating sample of `count` items, so each run checks a different slice. */
function rotatingSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const start = Math.floor(Math.random() * items.length);
  return Array.from({ length: count }, (_, i) => items[(start + i) % items.length]);
}

/** Varied broad-search phrasings, so runs don't keep hitting the same employers. */
function discoveryQueries(roles: string[]): string[] {
  const modifiers = [
    "entry level",
    "new grad",
    "associate",
    "I",
    "early career",
    "2026 graduate",
  ];
  const regions = [
    "",
    " Midwest",
    " Texas",
    " Southeast",
    " California",
    " Northeast",
    " remote",
  ];
  return rotatingSample(roles, 8).map(
    (role, i) =>
      `"${modifiers[i % modifiers.length]} ${role}${regions[i % regions.length]} jobs"`
  );
}

/** Company-name match used to flag ⭐ priority finds (was the old batch split). */
function matchesAnyCompany(company: string, names: string[]): boolean {
  const key = company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!key) return false;
  return names.some((name) => {
    const other = name.toLowerCase().split("(")[0].replace(/[^a-z0-9]+/g, " ").trim();
    if (!other) return false;
    return key.startsWith(other) || other.startsWith(key);
  });
}

function toListing(
  finding: JobWatchFinding,
  spec: BatchSpec
): JobWatchListing | null {
  const title = str(finding.title);
  const company = str(finding.company);
  const url = str(finding.url);
  if (!title || !company || !/^https?:\/\//i.test(url)) return null;

  // Enforce the freshness rule here too — the prompt asks for it, but the
  // model doesn't always comply. Undated postings are dropped, not guessed.
  const posted = str(finding.posted);
  const postedTime = parsePostedDate(posted);
  if (postedTime === null) return null;
  const ageDays = (Date.now() - postedTime) / DAY_MS;
  if (ageDays > JOB_WATCH_MAX_AGE_DAYS || ageDays < -2) return null;
  const postedDate = localIsoDate(new Date(postedTime));

  // Early-career only — same backstop idea for the seniority rule.
  if (isSeniorTitle(title)) return null;

  const location = str(finding.location);
  const why = str(finding.why);
  const summary = str(finding.summary);
  const level = str(finding.level).toLowerCase() === "stretch" ? "Stretch" : "Strong fit";

  // Visa sponsorship: drop anything the model flagged (or summarized) as not
  // sponsoring / citizens-only / clearance-required.
  const sponsorship = str(finding.sponsorship).toLowerCase();
  if (sponsorship === "no" || NO_SPONSORSHIP_TEXT.test(`${summary} ${why}`)) return null;
  const sponsors = sponsorship === "yes";
  const isPriorityCompany = matchesAnyCompany(company, spec.priorityCompanies);

  const description = [
    isPriorityCompany ? "⭐ Priority company" : null,
    `Fit: ${level}`,
    sponsors ? "Sponsorship: Yes" : null,
    location ? `Location: ${location}` : null,
    `Posted: ${postedDate}`,
    why ? `Why it fits: ${why}` : null,
    "",
    summary || title,
    "",
    `Found by Job Watch on ${new Date().toLocaleDateString("en-US")}. Posting: ${url}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    title,
    company,
    description,
    url,
    postedAt: new Date(postedTime).toISOString(),
    source: "job_watch",
    batch: spec.batch,
    country: spec.country,
  };
}

interface BatchSpec {
  batch: JobWatchBatch;
  country: string;
  prompt: string;
  /** Names that earn a find the ⭐ Priority badge. */
  priorityCompanies: string[];
}

async function runBatch(spec: BatchSpec): Promise<JobWatchListing[]> {
  const reply = await runClaudePrompt(spec.prompt, {
    timeoutMs: BATCH_TIMEOUT_MS,
    tools: WEB_TOOLS,
  });
  return parseFindings(reply)
    .map((finding) => toListing(finding, spec))
    .filter((listing): listing is JobWatchListing => listing !== null);
}

/** Runs async tasks with at most `limit` in flight; results in input order. */
async function settleWithLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function fetchJobWatchListings(input: {
  prefs: SearchPreferences;
  profile: Profile;
  trackedCompanies: string[];
  trackedRoles: string[];
  dismissedRoles: string[];
  /** Which schedules fired: "home" (US) and/or "international". */
  scopes: JobWatchBatch[];
}): Promise<JobWatchResult> {
  const roles = parseLineList(input.prefs.job_watch_roles);
  const priority = parseLineList(input.prefs.job_watch_priority_companies);
  const targets = parseLineList(input.prefs.job_watch_companies);
  const countries = parseLineList(input.prefs.job_watch_countries).filter(
    (c) => c !== HOME_COUNTRY
  );
  const context = sharedContext(
    input.profile,
    roles,
    input.trackedRoles,
    input.dismissedRoles
  );
  const home = HOME_COUNTRY;

  const batches: BatchSpec[] = [];
  // One merged home-country session (priority -> targets -> broad searches).
  if (input.scopes.includes("home") && (priority.length || targets.length || roles.length)) {
    batches.push({
      batch: "home",
      country: home,
      priorityCompanies: priority,
      prompt: homePrompt(
        context,
        priority,
        rotatingSample(
          targets.filter((t) => !t.startsWith("//")),
          TARGETS_PER_RUN
        ),
        input.trackedCompanies.slice(0, MAX_TRACKED_COMPANIES),
        roles
      ),
    });
  }
  // One search per international country, with that country's visa rules.
  for (const country of input.scopes.includes("international") ? countries : []) {
    const countryContext = sharedContext(
      input.profile,
      roles,
      input.trackedRoles,
      input.dismissedRoles,
      country
    );
    batches.push({
      batch: "international",
      country,
      priorityCompanies: priority,
      prompt: internationalPrompt(countryContext, country, [...priority, ...targets]),
    });
  }

  const settled = await settleWithLimit(
    batches.map((spec) => () => runBatch(spec)),
    MAX_PARALLEL_BATCHES
  );

  const listings: JobWatchListing[] = [];
  const errors: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      listings.push(...result.value);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const label = batches[i].batch === "international" ? batches[i].country : "US";
      errors.push(`${label} search failed: ${reason}`);
    }
  });

  if (batches.length === 0) return { listings: [], errors: [] };
  if (listings.length === 0 && errors.length > 0 && errors.length === batches.length) {
    throw new Error(errors.join(" | "));
  }
  return { listings, errors };
}
