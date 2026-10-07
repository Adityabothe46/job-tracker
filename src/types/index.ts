export type JobStatus =
  | "wishlist"
  | "referral"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected";

export const JOB_STATUSES: JobStatus[] = [
  "wishlist",
  "referral",
  "applied",
  "interviewing",
  "offer",
  "rejected",
];

export const STATUS_LABELS: Record<JobStatus, string> = {
  wishlist: "Wishlist",
  // Parked until the user has talked to a reference/referrer, then applies.
  referral: "Referral First",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

/** Stages that mean "an application was sent" — they set jobs.applied_at. */
export const APPLIED_STATUSES: JobStatus[] = ["applied", "interviewing", "offer", "rejected"];

export type GenerationType =
  | "cover_letter"
  | "resume_bullets"
  | "interview_questions"
  | "company_brief";

export const GENERATION_TYPES: GenerationType[] = [
  "cover_letter",
  "resume_bullets",
  "interview_questions",
  "company_brief",
];

export const GENERATION_LABELS: Record<GenerationType, string> = {
  cover_letter: "Cover letter",
  resume_bullets: "Resume bullets",
  interview_questions: "Interview questions",
  company_brief: "Company brief",
};

export type DiscoverySource = "company_boards" | "linkedin" | "indeed" | "job_watch";

export const DISCOVERY_SOURCES: DiscoverySource[] = [
  "company_boards",
  "linkedin",
  "indeed",
  "job_watch",
];

export const DISCOVERY_SOURCE_LABELS: Record<DiscoverySource, string> = {
  company_boards: "Company boards",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  job_watch: "Job Watch",
};

export type BoardType = "greenhouse" | "lever" | "generic";

export interface Job {
  id: string;
  title: string;
  company: string;
  source_url: string | null;
  description: string;
  status: JobStatus;
  position: number;
  /** NULL for manually-added jobs; set by the discovery scanner otherwise. */
  discovered_via: DiscoverySource | null;
  /** Best-effort inferred posting date from the source, for display only. */
  posted_at: string | null;
  /** First time the job reached an APPLIED_STATUSES stage (SQLite UTC datetime). */
  applied_at: string | null;
  /** Last time the job's status changed (SQLite UTC datetime). */
  status_changed_at: string | null;
  /** Which country's board this job is on (header country picker). */
  country: string;
  created_at: string;
  updated_at: string;
  /** Present only on list results — 1 if the job has any saved generations. */
  has_generations?: number;
}

export interface Generation {
  id: string;
  job_id: string;
  type: GenerationType;
  content: string;
  created_at: string;
}

export interface Profile {
  id: 1;
  resume_text: string;
  updated_at: string;
}

export interface JobDraft {
  title: string;
  company: string;
  description: string;
}

export interface SearchPreferences {
  id: 1;
  keywords: string;
  locations: string;
  remote_ok: number;
  freshness_hours: number;
  notification_email: string;
  source_company_boards_enabled: number;
  source_linkedin_enabled: number;
  source_indeed_enabled: number;
  /** Daily Claude-web-search "Job Watch" (see src/lib/discovery/job-watch.ts). */
  job_watch_enabled: number;
  /** Newline-separated; searched first and most thoroughly every run. */
  job_watch_priority_companies: string;
  /** Newline-separated target companies, in addition to broad US searches. */
  job_watch_companies: string;
  /** Newline-separated role types to look for. */
  job_watch_roles: string;
  /** Applications-per-day target for the board's KPI strip. */
  daily_goal: number;
  /** Newline-separated international countries (each its own board + Job Watch search). */
  job_watch_countries: string;
  /** Comma-separated local "HH:MM" times the US search runs at each day. */
  job_watch_times: string;
  /** Same, for the international-country searches (own schedule). */
  job_watch_times_intl: string;
  updated_at: string;
}

export interface WatchedBoard {
  id: string;
  company_name: string;
  board_type: BoardType;
  board_identifier: string;
  enabled: number;
  created_at: string;
}

export type ScanTrigger = "scheduled" | "manual";
export type ScanStatus = "running" | "ok" | "error";

export interface ScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger_type: ScanTrigger;
  source: DiscoverySource;
  status: ScanStatus;
  listings_found: number;
  listings_new: number;
  error_message: string | null;
}

/** Normalized shape every discovery connector returns, before ingestion. */
export interface RawListing {
  title: string;
  company: string;
  description: string;
  url: string;
  postedAt: string | null;
  source: DiscoverySource;
  /** Board country; omitted = home country (set by Job Watch's per-country batches). */
  country?: string;
}
