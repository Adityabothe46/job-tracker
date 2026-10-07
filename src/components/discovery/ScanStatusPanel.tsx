"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { timeAgo } from "@/lib/format";
import { DISCOVERY_SOURCE_LABELS, type ScanRun } from "@/types";

interface ScanStatusPanelProps {
  onToast: (message: string, tone?: "success" | "error") => void;
}

const STATUS_STYLES: Record<ScanRun["status"], string> = {
  running: "bg-surface-muted text-ink-muted",
  ok: "bg-emerald-500/15 text-emerald-300",
  error: "bg-red-500/15 text-red-300",
};

export function ScanStatusPanel({ onToast }: ScanStatusPanelProps) {
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  function loadRuns() {
    setLoading(true);
    fetch("/api/scan-runs")
      .then((res) => res.json())
      .then((data) => setRuns(data.runs))
      .catch(() => onToast("Couldn't load scan history.", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(loadRuns, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleScanNow() {
    setScanning(true);
    try {
      const res = await fetch("/api/scan/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");
      onToast(`Scan complete — ${data.newJobsCount} new job(s) added.`);
      loadRuns();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Scan failed.", "error");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          Runs automatically every hour while the app is running.
        </p>
        <Button type="button" variant="secondary" onClick={handleScanNow} disabled={scanning}>
          {scanning ? <Spinner /> : null}
          {scanning ? "Scanning… this may take a minute" : "Scan now"}
        </Button>
      </div>

      {loading ? (
        <div className="py-4 text-center text-sm text-ink-muted">Loading…</div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-ink-muted">No scans yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {runs.map((run) => (
            <li key={run.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {DISCOVERY_SOURCE_LABELS[run.source]}{" "}
                  <span className="font-normal text-ink-muted">
                    ({run.trigger_type})
                  </span>
                </p>
                {run.status === "error" && run.error_message ? (
                  <p className="mt-0.5 truncate text-xs text-red-400">
                    {run.error_message}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {run.listings_new} new / {run.listings_found} found
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[run.status]}`}
                >
                  {run.status}
                </span>
                <span className="text-xs text-ink-muted">
                  {timeAgo(run.started_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
