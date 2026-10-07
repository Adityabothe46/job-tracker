import { NextResponse } from "next/server";
import { runScanCycle } from "@/lib/discovery/scanner";

export async function POST() {
  try {
    const result = await runScanCycle("manual");
    return NextResponse.json(result);
  } catch (err) {
    // The orchestrator handles per-source failures internally — this is a
    // last-resort safety net in case something outside that (e.g. loading
    // preferences) throws.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed." },
      { status: 500 }
    );
  }
}
