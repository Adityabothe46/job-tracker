import nodemailer, { type Transporter } from "nodemailer";
import type { Job } from "@/types";

// Credentials live ONLY in .env.local (see .env.example) — never in the DB,
// never exposed through any API route/UI, and never something this code
// asks for interactively. Only the recipient address
// (search_preferences.notification_email) is user-configurable via settings.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Sends a digest of newly-discovered jobs. Never throws — a failed send
 * (missing credentials, bad app password, network issue, Gmail throttling)
 * is logged and swallowed, since the jobs are already committed to the board
 * by the time this runs regardless of whether the email goes out.
 */
export async function sendNewJobsDigest(
  toEmail: string,
  newJobs: Job[]
): Promise<void> {
  if (newJobs.length === 0) return;
  if (!toEmail?.trim()) {
    console.error("[notify] No notification_email configured — skipping digest.");
    return;
  }

  const transport = getTransporter();
  if (!transport) {
    console.error(
      "[notify] GMAIL_USER/GMAIL_APP_PASSWORD not set in .env.local — skipping digest. " +
        "See .env.example for setup instructions."
    );
    return;
  }

  const lines = newJobs.map(
    (job) =>
      `- ${job.title} @ ${job.company}\n` +
      `  Tracker: http://localhost:3000/?job=${job.id}\n` +
      (job.source_url ? `  Posting: ${job.source_url}\n` : "")
  );

  const subject = `${newJobs.length} new job match${newJobs.length === 1 ? "" : "es"} found`;
  const body =
    `Your job tracker found ${newJobs.length} new matching posting(s). ` +
    `A tailored cover letter and resume bullets have already been generated for each.\n\n` +
    lines.join("\n");

  try {
    await transport.sendMail({
      from: GMAIL_USER,
      to: toEmail,
      subject,
      text: body,
    });
  } catch (err) {
    console.error(
      "[notify] Failed to send digest email:",
      err instanceof Error ? err.message : err
    );
  }
}
