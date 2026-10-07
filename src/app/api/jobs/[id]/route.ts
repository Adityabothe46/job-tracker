import { NextRequest, NextResponse } from "next/server";
import { deleteJob, getJob, moveJob, updateJob } from "@/lib/jobs";
import { listGenerationsForJob } from "@/lib/generations";
import { JOB_STATUSES, type JobStatus } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const generations = listGenerationsForJob(params.id);
  return NextResponse.json({ job, generations });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = getJob(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await req.json();
  const { status, position, title, company, description, country } = body ?? {};

  // A drag-and-drop move includes both `status` and `position` (an index
  // within the destination column) — handled separately so we can re-number
  // the whole column consistently rather than colliding with another job's
  // position value.
  if (status !== undefined && position !== undefined) {
    if (!JOB_STATUSES.includes(status as JobStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    moveJob(params.id, status as JobStatus, position);
    return NextResponse.json({ job: getJob(params.id) });
  }

  const job = updateJob(params.id, {
    ...(status !== undefined ? { status } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(company !== undefined ? { company } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(typeof country === "string" && country.trim() ? { country: country.trim() } : {}),
  });

  return NextResponse.json({ job });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = getJob(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  deleteJob(params.id);
  return NextResponse.json({ ok: true });
}
