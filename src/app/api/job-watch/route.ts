import { NextRequest, NextResponse } from "next/server";
import { dueScopes, isJobWatchRunning, runJobWatch } from "@/lib/discovery/scanner";
import { getLatestScanRun } from "@/lib/scan-runs";
import { getSearchPreferences } from "@/lib/search-preferences";

// Status changes minute to minute — never let Next cache this GET.
export const dynamic = "force-dynamic";

function status() {
  return {
    enabled: !!getSearchPreferences().job_watch_enabled,
    running: isJobWatchRunning(),
    due: dueScopes().length > 0,
    lastRun: getLatestScanRun("job_watch") ?? null,
    lastOkRun: getLatestScanRun("job_watch", "ok") ?? null,
  };
}

export async function GET() {
  return NextResponse.json(status());
}

/**
 * Starts a Job Watch run in the background and returns immediately — a run
 * takes several minutes, far longer than a request should be held open. The
 * board polls GET for progress. Without `{force: true}` (the board's
 * on-open call, and the hourly timer), this is a no-op unless a run is due.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const force = !!body?.force;

  if (isJobWatchRunning()) {
    return NextResponse.json({ started: false, ...status() });
  }
  // Forced ("Refresh jobs") searches everything; a scheduled trigger only runs
  // the scopes whose time has come (US and international have separate times).
  const scopes = force ? (["home", "international"] as const) : dueScopes();
  if (scopes.length === 0) {
    return NextResponse.json({ started: false, ...status() });
  }

  void runJobWatch(force ? "manual" : "scheduled", [...scopes]).catch((err) =>
    console.error("[job-watch] Run crashed:", err)
  );
  return NextResponse.json({ started: true, ...status() });
}
