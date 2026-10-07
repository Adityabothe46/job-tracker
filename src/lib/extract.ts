import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { runClaudePrompt } from "./claude-cli";
import { buildExtractPrompt } from "./prompts";
import type { JobDraft } from "@/types";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 JobTracker/1.0";

/**
 * Fetches a job posting URL server-side (avoids CORS entirely) and reduces
 * the page to readable article text via Readability — the same
 * de-boilerplating technique Firefox Reader View uses. This step is
 * deliberately non-AI: cheap, deterministic, and shrinks what we hand to the
 * `claude` CLI next.
 */
export async function fetchReadableText(
  url: string
): Promise<{ title: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`Fetching the URL failed (HTTP ${res.status}).`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article || !article.textContent?.trim()) {
    // Fall back to raw body text if Readability can't find an article body.
    const bodyText = dom.window.document.body?.textContent?.trim() ?? "";
    return { title: dom.window.document.title || "", text: bodyText };
  }

  return { title: article.title || "", text: article.textContent.trim() };
}

function parseExtractedJson(raw: string): Partial<JobDraft> | null {
  try {
    // The CLI is asked for strict JSON but may still wrap it in prose or
    // fences occasionally — pull out the first {...} block defensively.
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;
    const parsed = JSON.parse(jsonText);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Partial<JobDraft>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Turns raw text (either Readability output from a URL, or text pasted
 * directly by the user) into a structured job draft via one `claude` CLI
 * call. Falls back to a best-effort draft if the CLI output isn't valid JSON
 * so the user can still fill in the gaps manually.
 */
async function extractDraftFromText(
  rawText: string,
  fallbackTitle: string
): Promise<JobDraft> {
  const prompt = buildExtractPrompt(rawText);
  const response = await runClaudePrompt(prompt);
  const parsed = parseExtractedJson(response);

  return {
    title: parsed?.title?.trim() || fallbackTitle || "Untitled role",
    company: parsed?.company?.trim() || "",
    description: parsed?.description?.trim() || rawText,
  };
}

export async function extractDraftFromUrl(url: string): Promise<JobDraft> {
  const { title, text } = await fetchReadableText(url);
  return extractDraftFromText(text, title);
}

export async function extractDraftFromRawText(
  rawText: string
): Promise<JobDraft> {
  return extractDraftFromText(rawText, "");
}
