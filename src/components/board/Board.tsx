"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  JOB_STATUSES,
  STATUS_LABELS,
  type Job,
  type JobStatus,
} from "@/types";
import { Column } from "./Column";
import { JobWatchBar } from "./JobWatchBar";
import { KpiStrip } from "./KpiStrip";
import { ArcReactor } from "@/components/ui/ArcReactor";
import { HOME_COUNTRY } from "@/lib/discovery/job-watch-defaults";
import { Button } from "@/components/ui/Button";
import { AddJobModal } from "@/components/add-job/AddJobModal";
import { JobDetailPanel } from "@/components/job-detail/JobDetailPanel";
import { Toast, useToast } from "@/components/ui/Toast";

type ColumnsState = Record<JobStatus, Job[]>;

const COUNTRY_STORAGE_KEY = "jobTracker.country";

function emptyColumns(): ColumnsState {
  return {
    wishlist: [],
    referral: [],
    applied: [],
    interviewing: [],
    offer: [],
    rejected: [],
  };
}

function groupJobs(jobs: Job[]): ColumnsState {
  const columns = emptyColumns();
  for (const job of jobs) {
    columns[job.status].push(job);
  }
  return columns;
}

export function Board() {
  const [columns, setColumns] = useState<ColumnsState>(emptyColumns());
  // Every job from the API (all countries); `columns` is the selected
  // country's slice of it.
  const [rawJobs, setRawJobs] = useState<Job[]>([]);
  // Wishlist multi-select (ids). Cleared whenever the board reloads or the
  // country changes, so stale ids can't linger.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const searchParams = useSearchParams();

  // Supports the deep link sent in the discovery digest email
  // (http://localhost:3000/?job={id}) — auto-opens that job's detail panel.
  useEffect(() => {
    const jobId = searchParams.get("job");
    if (jobId) setSelectedJobId(jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const loadJobs = useCallback(
    (options: { silent?: boolean } = {}) => {
      // Silent reloads (Job Watch finishing) keep the board on screen instead
      // of flashing the full "Loading your board…" state.
      if (!options.silent) setLoading(true);
      fetch("/api/jobs")
        .then((res) => res.json())
        .then((data) => setRawJobs(data.jobs))
        .catch(() => showToast("Couldn't load your board.", "error"))
        .finally(() => setLoading(false));
    },
    [showToast]
  );

  const refreshBoardSilently = useCallback(() => loadJobs({ silent: true }), [loadJobs]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Daily application goal for the KPI strip, and the international boards
  // offered in the country picker (both from Settings → Discovery).
  const [dailyGoal, setDailyGoal] = useState(15);
  const [configuredCountries, setConfiguredCountries] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/search-preferences")
      .then((res) => res.json())
      .then((data) => {
        const goal = Number(data?.preferences?.daily_goal);
        if (Number.isFinite(goal)) setDailyGoal(goal);
        const list = String(data?.preferences?.job_watch_countries ?? "")
          .split(/\r?\n/)
          .map((c: string) => c.trim())
          .filter(Boolean);
        setConfiguredCountries(list);
      })
      .catch(() => {});
  }, []);

  // Country picker: the whole board (columns, KPIs, counts) shows one
  // country's jobs at a time. Remembered per browser.
  const [country, setCountryState] = useState(HOME_COUNTRY);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COUNTRY_STORAGE_KEY);
      if (saved) setCountryState(saved);
    } catch {
      // storage unavailable — stay on the home country
    }
  }, []);
  function setCountry(next: string) {
    setCountryState(next);
    try {
      window.localStorage.setItem(COUNTRY_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  const countryOptions = useMemo(() => {
    const seen = new Set([HOME_COUNTRY, ...configuredCountries]);
    for (const job of rawJobs) seen.add(job.country || HOME_COUNTRY);
    return [...seen];
  }, [configuredCountries, rawJobs]);

  const countsByCountry = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const job of rawJobs) {
      const c = job.country || HOME_COUNTRY;
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [rawJobs]);

  // Columns hold only the selected country's jobs, so drag-and-drop indexes
  // and every KPI below are computed within that country.
  useEffect(() => {
    setColumns(groupJobs(rawJobs.filter((j) => (j.country || HOME_COUNTRY) === country)));
  }, [rawJobs, country]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [country]);

  function statusOf(id: string): JobStatus | null {
    if ((JOB_STATUSES as string[]).includes(id)) return id as JobStatus;
    for (const status of JOB_STATUSES) {
      if (columns[status].some((j) => j.id === id)) return status;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const status = statusOf(id);
    if (!status) return;
    const job = columns[status].find((j) => j.id === id) ?? null;
    setActiveJob(job);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveJob(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceStatus = statusOf(activeId);
    const destStatus = statusOf(overId);
    if (!sourceStatus || !destStatus) return;

    const sourceList = columns[sourceStatus];
    const activeIndex = sourceList.findIndex((j) => j.id === activeId);
    if (activeIndex === -1) return;

    const movingJob = sourceList[activeIndex];

    let destIndex: number;
    if (overId === destStatus) {
      // Dropped on the column background (empty column, or below all cards).
      destIndex =
        sourceStatus === destStatus
          ? sourceList.length - 1
          : columns[destStatus].length;
    } else {
      const destList = columns[destStatus];
      const foundIndex = destList.findIndex((j) => j.id === overId);
      destIndex = foundIndex === -1 ? destList.length : foundIndex;
    }

    if (sourceStatus === destStatus && destIndex === activeIndex) return;

    const previousColumns = columns;

    setColumns((prev) => {
      const next: ColumnsState = { ...prev };
      const newSource = [...prev[sourceStatus]];
      newSource.splice(activeIndex, 1);

      if (sourceStatus === destStatus) {
        newSource.splice(destIndex, 0, movingJob);
        next[sourceStatus] = newSource;
      } else {
        const newDest = [...prev[destStatus]];
        newDest.splice(destIndex, 0, { ...movingJob, status: destStatus });
        next[sourceStatus] = newSource;
        next[destStatus] = newDest;
      }
      return next;
    });

    fetch(`/api/jobs/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: destStatus, position: destIndex }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        // Re-fetch so server-set fields (applied_at for the KPIs, Wishlist's
        // date ordering) are reflected without a manual refresh.
        if (sourceStatus !== destStatus) loadJobs({ silent: true });
      })
      .catch(() => {
        setColumns(previousColumns);
        showToast("Couldn't save that move — reverted.", "error");
      });
  }

  const allJobs = useMemo(() => JOB_STATUSES.flatMap((status) => columns[status]), [columns]);
  const totalJobs = allJobs.length;
  const totalApplied = allJobs.filter((j) => j.applied_at).length;

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    for (const status of JOB_STATUSES) {
      const found = columns[status].find((j) => j.id === selectedJobId);
      if (found) return found;
    }
    return null;
  }, [columns, selectedJobId]);

  function toggleSelect(jobId: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  function selectAll(jobIds: string[], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of jobIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** Removes ids from both job lists without a server round-trip. */
  function dropJobsLocally(ids: string[]) {
    const gone = new Set(ids);
    setRawJobs((prev) => prev.filter((j) => !gone.has(j.id)));
    setColumns((prev) => {
      const next: ColumnsState = { ...prev };
      for (const status of JOB_STATUSES) {
        next[status] = prev[status].filter((j) => !gone.has(j.id));
      }
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function deleteOne(job: Job) {
    if (!window.confirm(`Delete "${job.title}" at ${job.company || "—"}?`)) return;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      dropJobsLocally([job.id]);
      showToast("Job deleted — it won't be suggested again.");
    } catch {
      showToast("Couldn't delete that job.", "error");
    }
  }

  async function deleteSelected() {
    const ids = columns.wishlist.filter((j) => selectedIds.has(j.id)).map((j) => j.id);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} posting${ids.length === 1 ? "" : "s"}? They won't be suggested again.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      dropJobsLocally(ids);
      showToast(`Deleted ${data.deleted} posting${data.deleted === 1 ? "" : "s"}.`);
    } catch {
      showToast("Couldn't delete those jobs.", "error");
    }
  }

  function handleJobDeleted(jobId: string) {
    setRawJobs((prev) => prev.filter((j) => j.id !== jobId));
    setColumns((prev) => {
      const next: ColumnsState = { ...prev };
      for (const status of JOB_STATUSES) {
        next[status] = prev[status].filter((j) => j.id !== jobId);
      }
      return next;
    });
  }

  function handleStatusChangeFromPanel(jobId: string, status: JobStatus) {
    // The panel already persisted this via PATCH; just refresh local
    // grouping so the card visually moves to the right column.
    loadJobs();
  }

  return (
    // Fixed to the viewport: the page itself never scrolls — each column
    // scrolls on its own (see Column.tsx), and the row of columns scrolls
    // sideways if it's wider than the window.
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="glass z-10 shrink-0 border-b border-line px-6 py-3">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ArcReactor size={38} />
            <div className="leading-tight">
              <h1 className="font-display text-lg font-bold tracking-tight text-gradient">
                Job Tracker
              </h1>
              <p className="whitespace-nowrap font-display text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                {totalJobs} roles tracked · {totalApplied} applied
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Country picker — switches the whole board to one country. */}
            <label className="flex items-center gap-2 rounded-md border border-line-strong bg-base/60 px-2.5 py-1.5 transition-colors hover:border-accent-400/60">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                Region
              </span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="cursor-pointer bg-transparent font-display text-xs font-semibold text-accent-100 focus:outline-none"
                title="Show jobs for this country"
              >
                {countryOptions.map((c) => (
                  <option key={c} value={c} className="bg-surface text-ink">
                    {c} ({countsByCountry[c] ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <JobWatchBar onBoardRefresh={refreshBoardSilently} onToast={showToast} />
            <Link
              href="/settings"
              className="rounded-lg px-2 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Settings
            </Link>
            <Button onClick={() => setAddModalOpen(true)}>+ Add Job</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 flex-col px-6 pt-5">
        {loading ? (
          <div className="py-20 text-center font-display text-xs uppercase tracking-[0.3em] text-ink-muted">
            Loading your board…
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="mb-4">
              <KpiStrip
                overallJobs={rawJobs}
                countryJobs={allJobs}
                countryLabel={country}
                goal={dailyGoal}
                onOpenJob={setSelectedJobId}
              />
            </div>
            <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-5">
              {JOB_STATUSES.map((status) => (
                <Column
                  key={status}
                  status={status}
                  label={STATUS_LABELS[status]}
                  jobs={columns[status]}
                  onCardClick={(job) => setSelectedJobId(job.id)}
                  selectable={status === "wishlist"}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onSelectAll={selectAll}
                  onDeleteOne={deleteOne}
                  onDeleteSelected={deleteSelected}
                />
              ))}
            </div>
            <DragOverlay>
              {activeJob ? (
                <div className="w-72 rotate-2 rounded-xl border border-accent-400/50 bg-surface-muted p-3.5 shadow-card-hover">
                  <p className="text-sm font-semibold text-ink">
                    {activeJob.title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {activeJob.company || "—"}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <AddJobModal
        open={addModalOpen}
        country={country}
        onClose={() => setAddModalOpen(false)}
        onCreated={(message) => {
          setAddModalOpen(false);
          loadJobs();
          showToast(message ?? "Job added.");
        }}
        onError={(message) => showToast(message, "error")}
      />

      <JobDetailPanel
        jobId={selectedJobId}
        countryOptions={countryOptions}
        onCountryChange={() => loadJobs({ silent: true })}
        onClose={() => setSelectedJobId(null)}
        onStatusChange={handleStatusChangeFromPanel}
        onDeleted={(jobId) => {
          handleJobDeleted(jobId);
          showToast("Job deleted.");
        }}
        onError={(message) => showToast(message, "error")}
      />

      <Toast toast={toast} />
    </div>
  );
}
