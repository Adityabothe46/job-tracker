// Board KPI math — pure functions over the job list the board already has, so
// there's no extra API. Day boundaries are the viewer's local calendar days.
import { parseSqliteDate, postedDaysAgo } from "./format";
import { HOME_COUNTRY } from "./discovery/job-watch-defaults";
import type { Job, JobStatus } from "@/types";

/** Applied 14+ days ago and still sitting in Applied → time to follow up. */
export const FOLLOW_UP_AFTER_DAYS = 14;
/** Parked in Referral First this long → nudge to contact the reference. */
export const REFERRAL_NUDGE_AFTER_DAYS = 5;

const DAY_MS = 86_400_000;

export function localDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysSince(sqliteDate: string, now: Date): number {
  return (now.getTime() - parseSqliteDate(sqliteDate).getTime()) / DAY_MS;
}

export interface DayCount {
  day: string; // YYYY-MM-DD
  count: number;
}

export type StageCounts = Record<JobStatus, number>;

export interface CountryBreakdown {
  country: string;
  total: number;
  applied: number; // jobs that ever reached Applied or later
}

export interface Kpis {
  goal: number;
  appliedToday: number;
  streak: number;
  bestStreak: number;
  appliedThisWeek: number;
  appliedLastWeek: number;
  last30Days: DayCount[];
  newRolesToday: number;
  newPriorityToday: number;
  followUps: Job[];
  freshWaiting: Job[];
  referralWaiting: Job[];
  referralTotal: number;

  // Pipeline / outcome metrics.
  totalTracked: number;
  totalEverApplied: number;
  stageCounts: StageCounts;
  /** Share of ever-applied jobs now Interviewing or Offer (0-1). */
  interviewRate: number;
  /** Share of ever-applied jobs now Offer (0-1). */
  offerRate: number;
  /** Share of ever-applied jobs now Rejected (0-1). */
  rejectionRate: number;
  /** Share of ever-applied jobs that moved past Applied either way (0-1). */
  responseRate: number;
  /** Average days from applied_at to status_changed_at for jobs past Applied. Null with no data. */
  avgDaysToResponse: number | null;
  /** How many jobs fed avgDaysToResponse. */
  respondedCount: number;

  /** Per-country counts, sorted by total descending. Only meaningful when jobs spans more than one country. */
  byCountry: CountryBreakdown[];
}

export function computeKpis(jobs: Job[], goal: number, now = new Date()): Kpis {
  const perDay = new Map<string, number>();
  for (const job of jobs) {
    if (!job.applied_at) continue;
    const key = localDayKey(parseSqliteDate(job.applied_at));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const countOn = (date: Date) => perDay.get(localDayKey(date)) ?? 0;

  const today = startOfDay(now);
  const appliedToday = countOn(today);

  // Streak = consecutive days meeting the goal. Today only counts once it's
  // met, so an in-progress day doesn't break a streak built up to yesterday.
  let streak = 0;
  if (goal > 0) {
    const cursor = new Date(today);
    if (appliedToday < goal) cursor.setDate(cursor.getDate() - 1);
    while (countOn(cursor) >= goal) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  let bestStreak = 0;
  if (goal > 0) {
    const days = [...perDay.entries()].filter(([, n]) => n >= goal).map(([d]) => d).sort();
    let run = 0;
    let prev: Date | null = null;
    for (const day of days) {
      const [y, m, d] = day.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      run = prev && Math.round((date.getTime() - prev.getTime()) / DAY_MS) === 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      prev = date;
    }
  }

  // Weeks start Monday.
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  let appliedThisWeek = 0;
  let appliedLastWeek = 0;
  for (let i = 0; i < 14; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() - 7 + i);
    if (day > today) break;
    if (i < 7) appliedLastWeek += countOn(day);
    else appliedThisWeek += countOn(day);
  }

  const last30Days: DayCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    last30Days.push({ day: localDayKey(day), count: countOn(day) });
  }

  const todayKey = localDayKey(today);
  const newToday = jobs.filter(
    (j) =>
      j.discovered_via === "job_watch" && localDayKey(parseSqliteDate(j.created_at)) === todayKey
  );

  const followUps = jobs
    .filter((j) => j.status === "applied" && j.applied_at && daysSince(j.applied_at, now) >= FOLLOW_UP_AFTER_DAYS)
    .sort((a, b) => a.applied_at!.localeCompare(b.applied_at!));

  const freshWaiting = jobs.filter(
    (j) => j.status === "wishlist" && j.posted_at && postedDaysAgo(j.posted_at) <= 1
  );

  const referrals = jobs.filter((j) => j.status === "referral");
  const referralWaiting = referrals
    .filter((j) => daysSince(j.status_changed_at ?? j.created_at, now) >= REFERRAL_NUDGE_AFTER_DAYS)
    .sort((a, b) => (a.status_changed_at ?? a.created_at).localeCompare(b.status_changed_at ?? b.created_at));

  // ---- Pipeline / outcome metrics ----
  const stageCounts: StageCounts = {
    wishlist: 0,
    referral: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
  };
  for (const job of jobs) stageCounts[job.status]++;

  const totalEverApplied = jobs.filter((j) => j.applied_at).length;
  const interviewingOrBetter = stageCounts.interviewing + stageCounts.offer;
  const respondedTotal = stageCounts.interviewing + stageCounts.offer + stageCounts.rejected;
  const rate = (n: number) => (totalEverApplied > 0 ? n / totalEverApplied : 0);

  const respondedJobs = jobs.filter(
    (j) =>
      (j.status === "interviewing" || j.status === "offer" || j.status === "rejected") &&
      j.applied_at &&
      j.status_changed_at
  );
  let avgDaysToResponse: number | null = null;
  if (respondedJobs.length > 0) {
    const totalDays = respondedJobs.reduce(
      (sum, j) =>
        sum +
        Math.max(0, (parseSqliteDate(j.status_changed_at!).getTime() - parseSqliteDate(j.applied_at!).getTime()) / DAY_MS),
      0
    );
    avgDaysToResponse = totalDays / respondedJobs.length;
  }

  // ---- Per-country breakdown (meaningful in the "overall" scope) ----
  const byCountryMap = new Map<string, { total: number; applied: number }>();
  for (const job of jobs) {
    const key = job.country || HOME_COUNTRY;
    const entry = byCountryMap.get(key) ?? { total: 0, applied: 0 };
    entry.total++;
    if (job.applied_at) entry.applied++;
    byCountryMap.set(key, entry);
  }
  const byCountry: CountryBreakdown[] = [...byCountryMap.entries()]
    .map(([country, v]) => ({ country, total: v.total, applied: v.applied }))
    .sort((a, b) => b.total - a.total);

  return {
    goal,
    appliedToday,
    streak,
    bestStreak,
    appliedThisWeek,
    appliedLastWeek,
    last30Days,
    newRolesToday: newToday.length,
    newPriorityToday: newToday.filter((j) => j.description.startsWith("⭐ Priority")).length,
    followUps,
    freshWaiting,
    referralWaiting,
    referralTotal: referrals.length,

    totalTracked: jobs.length,
    totalEverApplied,
    stageCounts,
    interviewRate: rate(interviewingOrBetter),
    offerRate: rate(stageCounts.offer),
    rejectionRate: rate(stageCounts.rejected),
    responseRate: rate(respondedTotal),
    avgDaysToResponse,
    respondedCount: respondedJobs.length,

    byCountry,
  };
}
