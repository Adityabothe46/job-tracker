"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Job, JobStatus } from "@/types";
import { JobCard } from "./JobCard";

interface ColumnProps {
  status: JobStatus;
  label: string;
  jobs: Job[];
  onCardClick: (job: Job) => void;
  /** Multi-select is enabled for Wishlist only (see Board). */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (jobId: string, selected: boolean) => void;
  onSelectAll?: (jobIds: string[], selected: boolean) => void;
  onDeleteOne?: (job: Job) => void;
  onDeleteSelected?: () => void;
}

// One signal color per pipeline stage. Full class strings (not built from
// fragments) so Tailwind's JIT can see them.
const STATUS_STYLES: Record<JobStatus, { dot: string; bar: string; count: string }> = {
  // HUD palette: cyan/blue family for the pipeline, amber for "in progress",
  // green for success, red for alerts. Glows kept soft for long use.
  wishlist: {
    dot: "bg-sky-300 shadow-[0_0_8px_1px_rgb(125_211_252_/_0.5)]",
    bar: "from-sky-300/70",
    count: "text-sky-300",
  },
  referral: {
    dot: "bg-indigo-300 shadow-[0_0_8px_1px_rgb(165_180_252_/_0.45)]",
    bar: "from-indigo-300/60",
    count: "text-indigo-300",
  },
  applied: {
    dot: "bg-accent-300 shadow-[0_0_8px_1px_rgb(110_230_255_/_0.6)]",
    bar: "from-accent-300/80",
    count: "text-accent-300",
  },
  interviewing: {
    dot: "bg-amber-400 shadow-[0_0_8px_1px_rgb(251_191_36_/_0.45)]",
    bar: "from-amber-400/70",
    count: "text-amber-300",
  },
  offer: {
    dot: "bg-emerald-400 shadow-[0_0_8px_1px_rgb(52_211_153_/_0.45)]",
    bar: "from-emerald-400/70",
    count: "text-emerald-300",
  },
  rejected: {
    dot: "bg-suit-400 shadow-[0_0_8px_1px_rgb(224_80_74_/_0.4)]",
    bar: "from-suit-400/60",
    count: "text-suit-400",
  },
};

export function Column({
  status,
  label,
  jobs,
  onCardClick,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeleteOne,
  onDeleteSelected,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const styles = STATUS_STYLES[status];
  const selectedCount = selectable && selectedIds
    ? jobs.reduce((n, job) => n + (selectedIds.has(job.id) ? 1 : 0), 0)
    : 0;
  const allSelected = jobs.length > 0 && selectedCount === jobs.length;

  return (
    <div className="glass hud-frame relative flex min-h-0 w-[18.5rem] shrink-0 flex-col overflow-hidden rounded-md border border-line">
      {/* Signal bar along the top edge in the stage's color. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${styles.bar} via-transparent to-transparent`}
      />
      <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-3.5">
        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
          {label}
        </h2>
        <span className={`ml-auto font-display text-sm font-semibold tabular-nums ${styles.count}`}>
          {jobs.length.toString().padStart(2, "0")}
        </span>
      </div>

      {/* Bulk-select bar: only rendered once something in this column is ticked. */}
      {selectable && selectedCount > 0 ? (
        <div className="mx-2.5 mb-1.5 flex shrink-0 items-center gap-2 rounded border border-accent-400/40 bg-accent-500/10 px-2 py-1.5">
          <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-accent-100">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={() => onSelectAll?.(jobs.map((j) => j.id), !allSelected)}
            className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {allSelected ? "Clear" : "Select all"}
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            className="rounded border border-suit-400/50 bg-suit-500/15 px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider text-suit-400 transition-colors hover:bg-suit-500/25"
          >
            Delete
          </button>
        </div>
      ) : null}
      <div
        ref={setNodeRef}
        className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 pt-1 transition-colors ${
          isOver ? "bg-accent-500/10" : ""
        }`}
      >
        <SortableContext
          items={jobs.map((j) => j.id)}
          strategy={verticalListSortingStrategy}
        >
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => onCardClick(job)}
              selectable={selectable}
              selected={selectedIds?.has(job.id) ?? false}
              onSelectChange={(checked) => onToggleSelect?.(job.id, checked)}
              onDelete={() => onDeleteOne?.(job)}
            />
          ))}
        </SortableContext>
        {jobs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line-strong py-8 font-display text-xs uppercase tracking-[0.2em] text-ink-faint">
            Empty
          </div>
        ) : null}
      </div>
    </div>
  );
}
