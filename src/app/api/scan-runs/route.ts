import { NextResponse } from "next/server";
import { listRecentScanRuns } from "@/lib/scan-runs";

export async function GET() {
  return NextResponse.json({ runs: listRecentScanRuns(20) });
}
