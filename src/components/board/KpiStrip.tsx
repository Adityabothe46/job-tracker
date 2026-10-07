"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeKpis,
  FOLLOW_UP_AFTER_DAYS,
  REFERRAL_NUDGE_AFTER_DAYS,
} from "@/lib/kpis";
import { parseSqliteDate, postedLabel } from "@/lib/format";
import { STATUS_LABELS, type Job, type JobStatus } from "@/types";

type Scope = "overall" | "country";

interface KpiStripProps {
  /** Every tracked job, across every country — powers the "Overall" scope. */
  overallJobs: Job[];
  /** Just the selected country's jobs — powers the "This country" scope. */
  countryJobs: Job[];
  /** Display name of the selected country, for the toggle's second label. */
  countryLabel: string;
  goal: number;
  onOpenJob: (jobId: string) => void;
}

function Tile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`glass hud-frame relative flex shrink-0 items-center gap-3 rounded-md border border-line px-4 py-3 ${className}`}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </p>
  );
}

/** Circular progress toward the daily goal. */
function GoalRing({ value, goal }: { value: number; goal: number }) {
  const size = 56;
  const stroke = 4;
  const r = (size - stroke) / 2 - 4; // leave room for the outer tick ring
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = goal > 0 && value >= goal;
  const tickR = size / 2 - 1;
  const tickCircumference = 2 * Math.PI * tickR;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id="goal-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0e97b8" />
          <stop offset="100%" stopColor="#9aeeff" />
        </linearGradient>
      </defs>
      {/* HUD tick ring: 36 short graduations around the gauge. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={tickR}
        stroke="rgb(92 225 255 / 0.35)"
        strokeWidth={2}
        fill="none"
        strokeDasharray={`1 ${tickCircumference / 36 - 1}`}
      />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(92 225 255 / 0.1)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={done ? "#34d399" : "url(#goal-ring)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

/** Tiny 30-day bar chart; today is highlighted, the goal is a dashed line. */
function ActivityBars({ days, goal }: { days: { day: string; count: number }[]; goal: number }) {
  const max = Math.max(goal, ...days.map((d) => d.count), 1);
  const height = 34;
  return (
    <div className="relative flex h-[34px] items-end gap-[2px]" aria-label="Applications per day, last 30 days">
      {goal > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-400/40"
          style={{ bottom: (goal / max) * height }}
        />
      ) : null}
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        const h = d.count === 0 ? 2 : Math.max(3, (d.count / max) * height);
        return (
          <div
            key={d.day}
            title={`${new Date(d.day + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${d.count} applied`}
            className={`w-[5px] rounded-sm ${
              isToday
                ? "bg-accent-50 shadow-[0_0_8px_1px_rgb(154_238_255_/_0.7)]"
                : goal > 0 && d.count >= goal
                  ? "bg-emerald-400/80"
                  : d.count > 0
                    ? "bg-accent-400/70"
                    : "bg-surface-strong"
            }`}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}

type ActionKey = "followUps" | "freshWaiting" | "referralWaiting";

const ACTIONS: { key: ActionKey; label: string; hint: string; dot: string }[] = [
  {
    key: "followUps",
    label: "Follow up",
    hint: `Applied ${FOLLOW_UP_AFTER_DAYS}+ days ago, no response yet`,
    dot: "bg-amber-400",
  },
  {
    key: "freshWaiting",
    label: "Fresh roles waiting",
    hint: "Posted in the last 24 hours — apply before they fill",
    dot: "bg-emerald-400",
  },
  {
    key: "referralWaiting",
    label: "Referral nudges",
    hint: `In Referral First ${REFERRAL_NUDGE_AFTER_DAYS}+ days — reach out to your reference`,
    dot: "bg-violet-300",
  },
];

function actionDetail(key: ActionKey, job: Job): string {
  if (key === "followUps" && job.applied_at) {
    const days = Math.floor((Date.now() - parseSqliteDate(job.applied_at).getTime()) / 86_400_000);
    return `Applied ${days} days ago`;
  }
  if (key === "freshWaiting" && job.posted_at) return postedLabel(job.posted_at);
  if (key === "referralWaiting") {
    const since = job.status_changed_at ?? job.created_at;
    const days = Math.floor((Date.now() - parseSqliteDate(since).getTime()) / 86_400_000);
    return `Waiting ${days} days`;
  }
  return "";
}

/**
 * The board's KPI row: today's progress toward the daily goal, streak,
 * weekly trend, pipeline outcomes, today's Job Watch finds, and a to-do list
 * of jobs that need action (click a count to see them; click a job to open
 * it). A scope toggle switches every tile between all tracked jobs ("Overall")
 * and just the country currently selected on the board — so "how am I doing"
 * and "how am I doing in the Netherlands" are both one click away.
 */
export function KpiStrip({ overallJobs, countryJobs, countryLabel, goal, onOpenJob }: KpiStripProps) {
  const distinctCountries = useMemo(
    () => new Set(overallJobs.map((j) => j.country || countryLabel)).size,
    [overallJobs, countryLabel]
  );
  const showScopeToggle = distinctCountries > 1;
  const [scope, setScope] = useState<Scope>("overall");
  // If every job is in one country, there's nothing to toggle to — pin to
  // "overall" (identical numbers) rather than show a dead control.
  const effectiveScope: Scope = showScopeToggle ? scope : "overall";
  const activeJobs = effectiveScope === "overall" ? overallJobs : countryJobs;

  const kpis = useMemo(() => computeKpis(activeJobs, goal), [activeJobs, goal]);
  const [openAction, setOpenAction] = useState<ActionKey | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openAction) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpenAction(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAction(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openAction]);

  const remaining = Math.max(0, goal - kpis.appliedToday);
  const weekDelta = kpis.appliedThisWeek - kpis.appliedLastWeek;
  const pct = (n: number) => Math.round(n * 100);

  return (
    <div className="flex flex-col gap-2.5">
      {showScopeToggle ? (
        <div className="flex w-fit shrink-0 gap-1 rounded-md border border-line bg-surface/60 p-1">
          {([
            ["overall", "Overall"],
            ["country", countryLabel],
          ] as [Scope, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={`rounded px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                effectiveScope === key
                  ? "border border-accent-300/60 bg-accent-500/20 text-accent-50"
                  : "border border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

    {/* Wraps rather than scrolls: a scroll container would clip the To-do popover. */}
    <div className="flex shrink-0 flex-wrap gap-3">
      {/* Today vs goal */}
      <Tile>
        {goal > 0 ? (
          <div className="relative">
            <GoalRing value={kpis.appliedToday} goal={goal} />
            <span className="absolute inset-0 flex items-center justify-center font-display text-[10px] font-bold text-accent-100">
              {Math.round(Math.min(1, kpis.appliedToday / goal) * 100)}%
            </span>
          </div>
        ) : null}
        <div>
          <Label>Applied today</Label>
          <p className="font-display text-2xl font-bold leading-tight text-ink">
            {kpis.appliedToday}
            {goal > 0 ? <span className="text-base font-semibold text-ink-faint"> / {goal}</span> : null}
          </p>
          {goal > 0 ? (
            <p className={`text-xs ${remaining === 0 ? "font-semibold text-emerald-300" : "text-ink-muted"}`}>
              {remaining === 0 ? "Goal hit — nice work" : `${remaining} to go`}
            </p>
          ) : null}
        </div>
      </Tile>

      {/* Streak */}
      {goal > 0 ? (
        <Tile>
          {/* Energy bolt: lit amber while a streak is running. */}
          <div
            className={`flex h-11 w-11 items-center justify-center rounded border ${
              kpis.streak > 0
                ? "border-amber-300/60 bg-amber-400/10 text-amber-300 shadow-[0_0_14px_-4px_rgb(251_191_36_/_0.7)]"
                : "border-line bg-surface-strong/60 text-ink-faint"
            }`}
            aria-hidden
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
          </div>
          <div>
            <Label>Streak</Label>
            <p className="font-display text-2xl font-bold leading-tight text-ink">
              {kpis.streak}
              <span className="text-base font-semibold text-ink-faint"> day{kpis.streak === 1 ? "" : "s"}</span>
            </p>
            <p className="text-xs text-ink-muted">Best: {kpis.bestStreak}</p>
          </div>
        </Tile>
      ) : null}

      {/* Week trend + 30-day activity */}
      <Tile>
        <div>
          <Label>This week</Label>
          <p className="font-display text-2xl font-bold leading-tight text-ink">{kpis.appliedThisWeek}</p>
          <p
            className={`text-xs font-medium ${
              weekDelta > 0 ? "text-emerald-300" : weekDelta < 0 ? "text-rose-300" : "text-ink-muted"
            }`}
          >
            {weekDelta > 0 ? "▲" : weekDelta < 0 ? "▼" : "•"} {Math.abs(weekDelta)} vs last week ({kpis.appliedLastWeek})
          </p>
        </div>
        <div className="ml-1 border-l border-line pl-3">
          <Label>Last 30 days</Label>
          <div className="mt-1">
            <ActivityBars days={kpis.last30Days} goal={goal} />
          </div>
        </div>
      </Tile>

      {/* Job Watch today */}
      <Tile>
        <div>
          <Label>New roles today</Label>
          <p className="font-display text-2xl font-bold leading-tight text-gradient">{kpis.newRolesToday}</p>
          <p className="text-xs text-ink-muted">
            <span className="text-amber-300">★ {kpis.newPriorityToday}</span> priority ·{" "}
            {kpis.referralTotal} in Referral First
          </p>
        </div>
      </Tile>

      {/* Pipeline outcomes: what applying has actually led to. */}
      {kpis.totalEverApplied > 0 ? (
        <Tile>
          <div>
            <Label>Pipeline</Label>
            <p className="font-display text-2xl font-bold leading-tight text-ink">
              {kpis.totalEverApplied}
              <span className="text-base font-semibold text-ink-faint"> applied</span>
            </p>
            <p className="text-xs text-ink-muted">
              <span className="text-amber-300">{pct(kpis.interviewRate)}% interview</span>
              {" · "}
              <span className="text-emerald-300">{pct(kpis.offerRate)}% offer</span>
              {" · "}
              <span className="text-rose-300">{pct(kpis.rejectionRate)}% rejected</span>
            </p>
            {/* Stacked funnel bar: pending, interviewing, offer, rejected. */}
            <div className="mt-2 flex h-1.5 w-44 overflow-hidden rounded-full bg-surface-strong">
              {(
                [
                  ["applied", "bg-accent-400/70"],
                  ["interviewing", "bg-amber-400"],
                  ["offer", "bg-emerald-400"],
                  ["rejected", "bg-rose-400/80"],
                ] as [JobStatus, string][]
              ).map(([status, color]) =>
                kpis.stageCounts[status] > 0 ? (
                  <div
                    key={status}
                    className={color}
                    style={{ width: `${(kpis.stageCounts[status] / kpis.totalEverApplied) * 100}%` }}
                    title={`${STATUS_LABELS[status]}: ${kpis.stageCounts[status]}`}
                  />
                ) : null
              )}
            </div>
          </div>
        </Tile>
      ) : null}

      {/* Average time from applying to hearing something back either way. */}
      {kpis.respondedCount > 0 ? (
        <Tile>
          <div>
            <Label>Avg response time</Label>
            <p className="font-display text-2xl font-bold leading-tight text-ink">
              {kpis.avgDaysToResponse!.toFixed(1)}
              <span className="text-base font-semibold text-ink-faint"> days</span>
            </p>
            <p className="text-xs text-ink-muted">
              {pct(kpis.responseRate)}% response rate · {kpis.respondedCount} replied
            </p>
          </div>
        </Tile>
      ) : null}

      {/* Per-country spread — only useful (and only shown) in the Overall scope. */}
      {effectiveScope === "overall" && kpis.byCountry.length > 1 ? (
        <Tile>
          <div className="min-w-[9rem]">
            <Label>By country</Label>
            <div className="mt-1.5 flex flex-col gap-1">
              {kpis.byCountry.slice(0, 4).map((c) => (
                <div key={c.country} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-ink-soft">{c.country}</span>
                  <span className="font-display font-semibold tabular-nums text-ink">{c.applied}</span>
                </div>
              ))}
              {kpis.byCountry.length > 4 ? (
                <p className="text-[11px] text-ink-faint">+{kpis.byCountry.length - 4} more</p>
              ) : null}
            </div>
          </div>
        </Tile>
      ) : null}

      {/* To-do */}
      <div ref={popoverRef} className="relative shrink-0">
        <Tile className="h-full">
          <div>
            <Label>To-do</Label>
            <div className="mt-1 flex flex-col gap-0.5">
              {ACTIONS.map((action) => {
                const list = kpis[action.key];
                return (
                  <button
                    key={action.key}
                    type="button"
                    title={action.hint}
                    onClick={() => setOpenAction(openAction === action.key ? null : action.key)}
                    disabled={list.length === 0}
                    className="flex items-center gap-2 rounded-md px-1 text-left text-xs text-ink-soft transition-colors hover:bg-surface-muted disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${list.length ? action.dot : "bg-surface-strong"}`} />
                    <span className="flex-1">{action.label}</span>
                    <span className="font-display font-semibold tabular-nums text-ink">{list.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Tile>

        {openAction ? (
          <div className="hud-frame absolute right-0 top-full z-30 mt-2 w-80 animate-fade-up rounded-md border border-line-strong bg-surface p-2 shadow-card-hover">
            <p className="px-2 pb-1.5 pt-1 text-xs text-ink-muted">
              {ACTIONS.find((a) => a.key === openAction)!.hint}
            </p>
            <ul className="max-h-72 overflow-y-auto">
              {kpis[openAction].map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAction(null);
                      onOpenJob(job.id);
                    }}
                    className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
                  >
                    <p className="truncate text-sm font-medium text-ink">{job.title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {job.company || "—"} · {actionDetail(openAction, job)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}
