"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { timeAgo } from "@/lib/format";
import type { ScanRun } from "@/types";

interface JobWatchStatus {
  enabled: boolean;
  running: boolean;
  due: boolean;
  lastRun: ScanRun | null;
  lastOkRun: ScanRun | null;
}

interface JobWatchBarProps {
  /** Reload the board without the full-page loading state. */
  onBoardRefresh: () => void;
  onToast: (message: string, tone?: "success" | "error") => void;
}

const POLL_INTERVAL_MS = 8_000;

/**
 * Header strip for the daily Job Watch search. On mount it asks the server to
 * run today's search if it hasn't yet (a no-op otherwise), then polls while a
 * run is in progress and refreshes the board when it finishes.
 */
export function JobWatchBar({ onBoardRefresh, onToast }: JobWatchBarProps) {
  const [status, setStatus] = useState<JobWatchStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);

  const applyStatus = useCallback(
    (next: JobWatchStatus) => {
      if (wasRunning.current && !next.running) {
        onBoardRefresh();
        const run = next.lastRun;
        if (run?.status === "ok") {
          onToast(
            run.listings_new > 0
              ? `Job Watch added ${run.listings_new} new role${run.listings_new === 1 ? "" : "s"} to Wishlist.`
              : "Job Watch finished — no new roles today."
          );
        } else if (run?.status === "error") {
          onToast("Job Watch search failed — see Settings → Discovery.", "error");
        }
      }
      wasRunning.current = next.running;
      setStatus(next);
    },
    [onBoardRefresh, onToast]
  );

  const start = useCallback(
    async (force: boolean) => {
      setStarting(true);
      try {
        const res = await fetch("/api/job-watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) throw new Error();
        applyStatus(await res.json());
      } catch {
        if (force) onToast("Couldn't start Job Watch.", "error");
      } finally {
        setStarting(false);
      }
    },
    [applyStatus, onToast]
  );

  // Opening/refreshing the page kicks off today's search if it's due.
  useEffect(() => {
    start(false);
  }, [start]);

  const running = !!status?.running;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetch("/api/job-watch")
        .then((res) => res.json())
        .then(applyStatus)
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [running, applyStatus]);

  if (!status) return null;

  if (!status.enabled) {
    return (
      <Link href="/settings" className="text-xs text-ink-muted hover:text-ink-soft">
        Job Watch is off
      </Link>
    );
  }

  const lastRun = status.lastRun;
  const lastOk = status.lastOkRun;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-line bg-base/40 px-3 py-1.5 text-xs leading-tight">
        {/* Live indicator: pulsing arc blue while searching, steady green when idle. */}
        <span className="relative flex h-2 w-2">
          {running ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow opacity-75" />
          ) : null}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              running
                ? "bg-glow"
                : lastRun?.status === "error"
                  ? "bg-red-400"
                  : "bg-emerald-400 shadow-[0_0_8px_1px_rgb(52_211_153_/_0.7)]"
            }`}
          />
        </span>
        <div className="text-left">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            Job Watch
          </p>
          {running ? (
            <p className="mt-0.5 flex items-center gap-1.5 font-medium text-sky-300">
              <Spinner className="h-3 w-3" /> Scanning career sites…
            </p>
          ) : lastOk ? (
            <p className="mt-0.5 text-ink-muted">
              Checked {timeAgo(lastOk.finished_at ?? lastOk.started_at)} ·{" "}
              <span className={lastOk.listings_new > 0 ? "font-semibold text-accent-300" : ""}>
                {lastOk.listings_new} new
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-ink-muted">Hasn&apos;t run yet</p>
          )}
        </div>
        {!running && lastRun?.status === "error" ? (
          <p className="mt-0.5 max-w-[320px] truncate text-red-400" title={lastRun.error_message ?? ""}>
            Last search failed: {lastRun.error_message}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => start(true)}
        disabled={running || starting}
        className="py-1.5"
      >
        Refresh jobs
      </Button>
    </div>
  );
}
