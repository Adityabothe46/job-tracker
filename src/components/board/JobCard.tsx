"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DISCOVERY_SOURCE_LABELS, type Job } from "@/types";
import { hoursSince, postedDaysAgo, postedLabel, timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { jobBoardName } from "@/lib/job-sources";

interface JobCardProps {
  job: Job;
  onClick: () => void;
  /** Multi-select (Wishlist only) — omitted elsewhere, which hides the controls. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onDelete?: () => void;
}

export function JobCard({
  job,
  onClick,
  selectable = false,
  selected = false,
  onSelectChange,
  onDelete,
}: JobCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id });

  // Job Watch writes these markers into the description it saves (see
  // src/lib/discovery/job-watch.ts) — cheaper than extra columns for display.
  const fromJobWatch = job.discovered_via === "job_watch";
  const isNew = fromJobWatch && hoursSince(job.created_at) < 24;
  const isPriority = fromJobWatch && job.description.startsWith("⭐ Priority");
  const isStretch = fromJobWatch && /^Fit: Stretch$/m.test(job.description);
  const sponsorsVisa = fromJobWatch && /^Sponsorship: Yes$/m.test(job.description);
  const boardName = jobBoardName(job.source_url);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-md border bg-surface-muted/60 p-3.5 shadow-card transition-[border-color,background-color,box-shadow] duration-200 hover:border-accent-400/50 hover:bg-surface-muted hover:shadow-card-hover ${
        isNew ? "border-accent-400/35" : "border-line"
      } ${selected ? "border-accent-300/70 bg-accent-500/10" : ""}`}
    >
      {selectable ? (
        // Stop pointer/click propagation so these don't start a drag or open
        // the detail panel (dnd-kit's listeners live on the card root).
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Delete this posting"
            aria-label="Delete this posting"
            onClick={onDelete}
            className="rounded p-1 text-ink-faint opacity-0 transition-opacity hover:bg-suit-500/15 hover:text-suit-400 focus:opacity-100 group-hover:opacity-100"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            title="Select for bulk delete"
            aria-label={`Select ${job.title}`}
            className="h-3.5 w-3.5 cursor-pointer accent-accent-500"
          />
        </div>
      ) : null}
      <div className={`flex items-start gap-3 ${selectable ? "pr-12" : ""}`}>
        {/* Company monogram — an outlined hologram tile (amber for priority
            companies, the HUD's highlight color). */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border font-display text-sm font-bold ${
            isPriority
              ? "border-amber-300/60 bg-amber-400/10 text-amber-200"
              : "border-accent-400/45 bg-accent-500/10 text-accent-200"
          }`}
        >
          {(job.company.trim()[0] || "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-ink">{job.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{job.company || "—"}</p>
        </div>
      </div>

      {job.discovered_via ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {isNew ? (
            <Badge className="gap-1 bg-accent-500/20 text-accent-50 ring-1 ring-accent-300/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-200" />
              New
            </Badge>
          ) : null}
          {isPriority ? (
            <Badge className="bg-amber-400/15 text-amber-300">★ Priority</Badge>
          ) : null}
          {isStretch ? <Badge className="bg-surface-strong text-ink-soft">Stretch</Badge> : null}
          {sponsorsVisa ? (
            <Badge className="bg-emerald-500/15 text-emerald-300">Sponsors visa</Badge>
          ) : null}
          {fromJobWatch ? (
            // Where the link actually goes: the user prefers career sites.
            boardName ? (
              <Badge className="bg-surface-strong text-ink-muted">via {boardName}</Badge>
            ) : (
              <Badge className="bg-emerald-500/15 text-emerald-300">Career site</Badge>
            )
          ) : (
            <Badge className="bg-glow/10 text-sky-300">
              {DISCOVERY_SOURCE_LABELS[job.discovered_via]}
            </Badge>
          )}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
        {job.posted_at ? (
          // Freshness color: green within a day, arc blue within a week, gray after.
          <span
            className={`font-display text-[11px] font-semibold uppercase tracking-wider ${
              postedDaysAgo(job.posted_at) <= 1
                ? "text-emerald-300"
                : postedDaysAgo(job.posted_at) <= 7
                  ? "text-sky-300"
                  : "text-ink-faint"
            }`}
            title={`Added ${timeAgo(job.created_at)}`}
          >
            {postedLabel(job.posted_at)}
          </span>
        ) : (
          <span className="font-display text-[11px] uppercase tracking-wider text-ink-faint">
            Added {timeAgo(job.created_at)}
          </span>
        )}
        {job.has_generations ? (
          <span
            className="h-1.5 w-1.5 rounded-full bg-glow shadow-[0_0_8px_2px_rgb(34_211_238_/_0.6)]"
            title="Has generated content"
          />
        ) : null}
      </div>
    </div>
  );
}
