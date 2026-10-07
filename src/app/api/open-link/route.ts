import { NextRequest, NextResponse } from "next/server";
import { findChromeExe, listChromeProfiles, openInChrome } from "@/lib/chrome-profiles";

// Reads Chrome's profile list fresh each time — never cache.
export const dynamic = "force-dynamic";

/** Chrome profiles available for opening job links (see chrome-profiles.ts). */
export async function GET() {
  const { profiles, lastUsed } = listChromeProfiles();
  return NextResponse.json({ available: !!findChromeExe(), profiles, lastUsed });
}

/** Opens a job-posting link in the user's Chrome, in the requested profile. */
export async function POST(req: NextRequest) {
  // Require a JSON request: a browser only lets another website send that
  // cross-origin after a CORS preflight, which this server never approves —
  // so random pages can't use this to launch Chrome.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    openInChrome(String(body?.url ?? ""), body?.profile ? String(body.profile) : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't open that link." },
      { status: 400 }
    );
  }
}
