import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { saveGeneration } from "@/lib/generations";
import { getProfile } from "@/lib/profile";
import { buildGenerationPrompt } from "@/lib/prompts";
import { runClaudePrompt, ClaudeCliError } from "@/lib/claude-cli";
import { GENERATION_TYPES, type GenerationType } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await req.json();
  const type = body?.type as GenerationType;
  if (!GENERATION_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Invalid generation type" },
      { status: 400 }
    );
  }

  const profile = getProfile();
  const prompt = buildGenerationPrompt(type, job, profile);

  try {
    const content = await runClaudePrompt(prompt);
    const generation = saveGeneration(job.id, type, content);
    return NextResponse.json({ generation });
  } catch (err) {
    if (err instanceof ClaudeCliError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Something went wrong generating content." },
      { status: 500 }
    );
  }
}
