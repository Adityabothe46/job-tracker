import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/profile";

export async function GET() {
  return NextResponse.json({ profile: getProfile() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const resumeText = body?.resume_text ?? "";
  const profile = saveProfile(resumeText);
  return NextResponse.json({ profile });
}
