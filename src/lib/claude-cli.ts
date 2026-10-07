// Invokes the locally-installed `claude` CLI (Claude Code, already
// authenticated on this machine) as a subprocess instead of calling a billed
// API directly. The prompt is sent via stdin (never as a CLI argument) to
// avoid Windows command-line length limits and shell-escaping entirely.
//
// On Windows, npm installs `claude` as a `.cmd` shim, and Node's
// `child_process.spawn` cannot execute `.cmd`/`.bat` files directly when
// `shell: false` — it fails with ENOENT/EINVAL even if the file exists and is
// on PATH. The usual fix is `shell: true`, but that makes Node treat the args
// array as an unescaped, concatenated shell string (a real risk when args
// come from user input). Ours never do — `CLI_PATH` and the flags below are
// fixed literals, and all untrusted content (job postings, resumes) goes
// through stdin, never argv — so instead we explicitly hand the fixed argv to
// `cmd.exe /d /s /c` ourselves on Windows. That keeps `shell: false` (no
// generic shell-string parsing of anything) while still letting `.cmd` shims
// run.
import { spawn } from "node:child_process";

const CLI_PATH = process.env.CLAUDE_CLI_PATH || "claude";
const DEFAULT_TIMEOUT_MS = 90_000;
const IS_WINDOWS = process.platform === "win32";

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "timeout"
      | "nonzero_exit"
      | "empty_output"
  ) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

export interface RunClaudeOptions {
  timeoutMs?: number;
  /**
   * Built-in tools the CLI may use without prompting (e.g. WebSearch for Job
   * Watch). Must be fixed literals from code — never user input — since on
   * Windows they're passed through cmd.exe's argv. Omitted = no tools, the
   * plain text-in/text-out behavior every other caller relies on.
   */
  tools?: string[];
}

/**
 * Runs the prompt through the local `claude` CLI in non-interactive mode and
 * returns the plain-text response.
 */
export function runClaudePrompt(
  prompt: string,
  options: RunClaudeOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const cliArgs = ["-p", "--output-format", "text"];
    if (options.tools?.length) {
      const toolList = options.tools.join(",");
      // --tools restricts what's available at all; --allowedTools pre-approves
      // them so a non-interactive run doesn't stall on a permission prompt.
      cliArgs.push("--tools", toolList, "--allowedTools", toolList);
    }
    const command = IS_WINDOWS ? "cmd.exe" : CLI_PATH;
    const args = IS_WINDOWS
      ? ["/d", "/s", "/c", CLI_PATH, ...cliArgs]
      : cliArgs;

    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new ClaudeCliError(
          "Claude CLI took too long to respond. Please try again.",
          "timeout"
        )
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new ClaudeCliError(
            "Claude CLI not found. Make sure Claude Code is installed and the `claude` command is on your PATH (or set CLAUDE_CLI_PATH).",
            "not_found"
          )
        );
      } else {
        reject(new ClaudeCliError(err.message, "nonzero_exit"));
      }
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (exitCode !== 0) {
        reject(
          new ClaudeCliError(
            stderr.trim() ||
              stdout.trim() ||
              `Claude CLI exited with code ${exitCode}. It may need you to run \`claude\` and then \`/login\` again.`,
            "nonzero_exit"
          )
        );
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(
          new ClaudeCliError(
            "Claude CLI returned an empty response. Please try again.",
            "empty_output"
          )
        );
        return;
      }

      resolve(trimmed);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
