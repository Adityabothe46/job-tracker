import { NextRequest, NextResponse } from "next/server";
import {
  claimAsManual,
  deleteJobs,
  createJob,
  findJobBySourceUrl,
  findJobByCompanyAndTitle,
  isHiddenFromBoard,
  listJobs,
  undismiss,
} from "@/lib/jobs";
import { STATUS_LABELS, type JobStatus } from "@/types";

export async function GET() {
  const jobs = listJobs();
  return NextResponse.json({ jobs });
}

/**
 * Bulk delete from the board's multi-select. Like single deletes, every job
 * removed here is remembered in `dismissed_jobs` so discovery won't re-add it.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }
  const deleted = deleteJobs(ids);
  return NextResponse.json({ deleted });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, company, description, source_url, status, country } = body ?? {};

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 }
    );
  }

  // Don't create a second copy of a job that's already on the board (e.g.
  // Job Watch found it earlier). If that copy was hidden — an old or senior
  // Job Watch find — adopting it as a manual job brings it back into view.
  const url = source_url?.trim() || null;
  const existing =
    (url ? findJobBySourceUrl(url) : undefined) ??
    findJobByCompanyAndTitle((company ?? "").trim(), title.trim());
  if (existing) {
    const wasHidden = isHiddenFromBoard(existing.id);
    if (wasHidden) claimAsManual(existing.id);
    return NextResponse.json({
      job: existing,
      duplicate: true,
      message: wasHidden
        ? `Already tracked — restored it to ${STATUS_LABELS[existing.status]}.`
        : `Already on your board in ${STATUS_LABELS[existing.status]} — no copy added.`,
    });
  }

  // Adding a job back by hand overrides an earlier deletion of it.
  undismiss((company ?? "").trim(), title.trim(), url);

  const job = createJob({
    title: title.trim(),
    company: (company ?? "").trim(),
    description: description.trim(),
    source_url: url,
    status: status as JobStatus | undefined,
    country: typeof country === "string" ? country : undefined,
  });

  return NextResponse.json({ job }, { status: 201 });
}
