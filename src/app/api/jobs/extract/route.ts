import { NextRequest, NextResponse } from "next/server";
import { extractDraftFromRawText, extractDraftFromUrl } from "@/lib/extract";
import { ClaudeCliError } from "@/lib/claude-cli";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, rawText } = body ?? {};

  if (!url?.trim() && !rawText?.trim()) {
    return NextResponse.json(
      { error: "Provide either a url or rawText" },
      { status: 400 }
    );
  }

  try {
    const draft = url?.trim()
      ? await extractDraftFromUrl(url.trim())
      : await extractDraftFromRawText(rawText.trim());
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof ClaudeCliError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to read that job posting.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
