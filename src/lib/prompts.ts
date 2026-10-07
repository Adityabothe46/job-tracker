import type { GenerationType, Job, Profile } from "@/types";

const MAX_DESCRIPTION_CHARS = 6000;
const MAX_EXTRACT_CHARS = 8000;

const SYSTEM_PREAMBLE =
  "You are helping a job applicant prepare materials for a specific job application. " +
  "Respond directly with the requested content only — no meta-commentary, no restating " +
  "these instructions, no markdown code fences unless the content itself is a list.";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...[truncated]";
}

function contextBlock(job: Job, profile: Profile): string {
  return `JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB POSTING:
"""
${truncate(job.description, MAX_DESCRIPTION_CHARS)}
"""

CANDIDATE BACKGROUND / RESUME:
"""
${truncate(profile.resume_text, MAX_DESCRIPTION_CHARS)}
"""`;
}

const TASK_INSTRUCTIONS: Record<GenerationType, string> = {
  cover_letter:
    "Write a professional, concise cover letter (roughly 250-350 words) for this candidate " +
    "applying to this specific role. Reference specific details from the job posting and " +
    "specific relevant experience from the candidate's background. Do not invent facts not " +
    "present in the candidate's background. Output only the letter body, no placeholder " +
    "brackets like [Your Name], and sign off with the candidate's name if it appears in the " +
    "background, otherwise omit the signature line.",
  resume_bullets:
    "Rewrite 5-8 resume bullet points from the candidate's background so they are tailored " +
    "to this specific job posting — emphasizing the skills, keywords, and responsibilities " +
    "this posting cares about, using strong action verbs and quantifiable impact where the " +
    "original background provides numbers. Do not fabricate metrics or experience not implied " +
    "by the background. Output as a plain bulleted list, one bullet per line starting with \"- \".",
  interview_questions:
    "Based on this job posting and the candidate's background, generate exactly 5 interview " +
    "questions this candidate is likely to be asked for this role — a mix of behavioral and " +
    "role/technical questions relevant to the posting. For each question, add one sentence of " +
    "guidance on what a strong answer would touch on, referencing the candidate's actual " +
    "background where relevant. Number them 1 through 5.",
  company_brief:
    "Write a concise one-page brief about the company for someone about to interview there, " +
    "based on the job posting content and your general knowledge of the company if you have " +
    "any. Cover: what the company/product does, the likely team context implied by this " +
    "posting, and 2-3 smart questions the candidate could ask the interviewer. If you are not " +
    "confident about a specific fact, say it's inferred rather than presenting it as certain.",
};

export function buildGenerationPrompt(
  type: GenerationType,
  job: Job,
  profile: Profile
): string {
  return `${SYSTEM_PREAMBLE}

${contextBlock(job, profile)}

TASK: ${TASK_INSTRUCTIONS[type]}`;
}

/**
 * Prompt used to turn arbitrary extracted webpage/pasted text into structured
 * {title, company, description} fields for the Add Job draft.
 */
export function buildExtractPrompt(rawText: string): string {
  return `${SYSTEM_PREAMBLE}

Below is extracted text from a job posting (it may include some leftover page
boilerplate). Identify the job title, the hiring company name, and the full
job description text (responsibilities, requirements, etc., excluding site
navigation/footer boilerplate where possible).

Respond ONLY with strict JSON in exactly this shape, no other text:
{"title": "...", "company": "...", "description": "..."}

If you cannot confidently identify the company name, use an empty string for it.

EXTRACTED TEXT:
"""
${truncate(rawText, MAX_EXTRACT_CHARS)}
"""`;
}
