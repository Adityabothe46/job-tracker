// Opens job-posting links in the user's own Chrome, in a chosen profile.
//
// Why this exists: the desktop launcher opens the tracker in a Chrome --app
// window with a *dedicated* profile (so it can tell when the window closes —
// see launcher/launch-tracker.ps1). A plain <a target="_blank"> from that
// window would open in that empty profile, where the user isn't signed in to
// anything. Instead the page asks this server to launch the real Chrome with
// --profile-directory, which hands the URL to the already-running browser.
//
// Profile names come from Chrome's own "Local State" file. Only URLs and
// profile dirs that pass validation are ever put in argv, and spawn() runs
// with shell: false, so nothing is interpreted by a shell.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface ChromeProfile {
  /** Folder name Chrome uses, e.g. "Default" or "Profile 8". */
  dir: string;
  /** Display name as shown in Chrome's profile menu. */
  name: string;
  /** Signed-in Google account, if any — shown to tell same-named profiles apart. */
  email: string;
}

function userDataDir(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? path.join(localAppData, "Google", "Chrome", "User Data") : null;
}

export function findChromeExe(): string | null {
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"]!, "Google/Chrome/Application/chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function listChromeProfiles(): { profiles: ChromeProfile[]; lastUsed: string | null } {
  const dir = userDataDir();
  if (!dir) return { profiles: [], lastUsed: null };
  try {
    const state = JSON.parse(fs.readFileSync(path.join(dir, "Local State"), "utf-8"));
    const cache = (state?.profile?.info_cache ?? {}) as Record<
      string,
      { name?: string; user_name?: string }
    >;
    const profiles = Object.entries(cache)
      .map(([profileDir, info]) => ({
        dir: profileDir,
        name: info.name?.trim() || profileDir,
        email: info.user_name?.trim() || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const lastUsed = typeof state?.profile?.last_used === "string" ? state.profile.last_used : null;
    return { profiles, lastUsed };
  } catch {
    return { profiles: [], lastUsed: null };
  }
}

/**
 * Opens `url` in the user's Chrome. Unknown/empty `profileDir` falls back to
 * Chrome's last-used profile. Throws if Chrome isn't installed or the URL
 * isn't a plain http(s) link.
 */
export function openInChrome(url: string, profileDir?: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Not a valid link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) links can be opened.");
  }

  const chrome = findChromeExe();
  if (!chrome) throw new Error("Google Chrome isn't installed.");

  const { profiles, lastUsed } = listChromeProfiles();
  const known = new Set(profiles.map((p) => p.dir));
  const chosen = profileDir && known.has(profileDir) ? profileDir : lastUsed;

  const args = chosen ? [`--profile-directory=${chosen}`, parsed.toString()] : [parsed.toString()];
  const child = spawn(chrome, args, { detached: true, stdio: "ignore", shell: false, windowsHide: false });
  child.unref();
}
