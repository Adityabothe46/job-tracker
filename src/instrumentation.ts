// Runs once when the Next.js server process boots (dev or start) — see
// next.config.mjs's experimental.instrumentationHook. This is what makes
// hourly job discovery "just work" while `npm run dev`/`start` is running,
// with no custom server and no OS-level scheduled task. The interval dies
// naturally when that process is closed.
//
// Deliberately calls the existing POST /api/scan/run route over plain HTTP
// rather than importing the scanner module directly. Next.js bundles
// instrumentation.ts for both the edge and nodejs runtimes, and the edge
// webpack pass can't handle "node:" scheme imports (node:sqlite, node:crypto,
// etc.) that the scanner's dependency chain pulls in — even behind a
// runtime-guarded dynamic import, webpack still tries to statically resolve
// it. Hitting the API route keeps this file free of any Node-only
// dependencies, and means the scheduled and manual ("Scan now") triggers
// share the exact same code path.
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = 5_000; // give the HTTP server a moment to start listening

declare global {
  // eslint-disable-next-line no-var
  var __scanIntervalStarted: boolean | undefined;
}

function baseUrl(): string {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function triggerScan() {
  // Job Watch first: its POST returns immediately (the run continues in the
  // background) and is a no-op unless today's run hasn't happened yet.
  try {
    const res = await fetch(`${baseUrl()}/api/job-watch`, { method: "POST" });
    if (!res.ok) {
      console.error(`[instrumentation] Job Watch check returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[instrumentation] Job Watch check request failed:", err);
  }

  try {
    const res = await fetch(`${baseUrl()}/api/scan/run`, { method: "POST" });
    if (!res.ok) {
      console.error(`[instrumentation] Scheduled scan returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[instrumentation] Scheduled scan request failed:", err);
  }
}

export async function register() {
  // register() fires once per runtime (nodejs + edge in some configs) —
  // only the nodejs pass should actually schedule anything.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against double-registration across dev hot-reloads, the same way
  // src/lib/db.ts guards its connection via global.__appDb.
  if (global.__scanIntervalStarted) return;
  global.__scanIntervalStarted = true;

  setTimeout(() => {
    triggerScan();
    setInterval(triggerScan, SCAN_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
