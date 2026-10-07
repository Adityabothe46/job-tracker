import { NextRequest, NextResponse } from "next/server";
import {
  getSearchPreferences,
  normalizeTimes,
  saveSearchPreferences,
} from "@/lib/search-preferences";

export async function GET() {
  return NextResponse.json({ preferences: getSearchPreferences() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const preferences = saveSearchPreferences({
    keywords: body?.keywords ?? "",
    locations: body?.locations ?? "",
    remote_ok: !!body?.remote_ok,
    freshness_hours: Number(body?.freshness_hours) || 48,
    notification_email: body?.notification_email ?? "",
    source_company_boards_enabled: !!body?.source_company_boards_enabled,
    source_linkedin_enabled: !!body?.source_linkedin_enabled,
    source_indeed_enabled: !!body?.source_indeed_enabled,
    job_watch_enabled: !!body?.job_watch_enabled,
    job_watch_priority_companies: String(body?.job_watch_priority_companies ?? ""),
    job_watch_companies: String(body?.job_watch_companies ?? ""),
    job_watch_roles: String(body?.job_watch_roles ?? ""),
    job_watch_countries: String(body?.job_watch_countries ?? ""),
    // Empty = only run when the user clicks "Refresh jobs".
    job_watch_times: normalizeTimes(String(body?.job_watch_times ?? "")),
    job_watch_times_intl: normalizeTimes(String(body?.job_watch_times_intl ?? "")),
    // 0 = no goal (KPI strip shows counts only); capped to something sane.
    daily_goal: Math.min(100, Math.max(0, Math.round(Number(body?.daily_goal) || 0))),
  });
  return NextResponse.json({ preferences });
}
