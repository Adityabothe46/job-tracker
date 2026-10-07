"use client";

import { useEffect, useState } from "react";

interface ChromeProfile {
  dir: string;
  name: string;
  email: string;
}

// Per-browser memory of the chosen profile. Losing it is harmless — the
// server falls back to Chrome's last-used profile.
const STORAGE_KEY = "jobTracker.chromeProfile";

function readSavedProfile(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveProfile(dir: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, dir);
  } catch {
    // ignore — see STORAGE_KEY note
  }
}

/**
 * "View original posting" link that opens in the user's real Chrome profile
 * (via /api/open-link) instead of the tracker window's empty one, with a
 * small picker to choose which profile. Falls back to a normal new tab if
 * Chrome can't be driven (e.g. opened on another machine).
 */
export function OpenPostingLink({
  url,
  onError,
}: {
  url: string;
  onError: (message: string) => void;
}) {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [available, setAvailable] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetch("/api/open-link")
      .then((res) => res.json())
      .then((data: { available: boolean; profiles: ChromeProfile[]; lastUsed: string | null }) => {
        setAvailable(data.available && data.profiles.length > 0);
        setProfiles(data.profiles);
        const saved = readSavedProfile();
        const valid = data.profiles.some((p) => p.dir === saved);
        setSelected(valid ? saved : data.lastUsed ?? data.profiles[0]?.dir ?? "");
      })
      .catch(() => setAvailable(false));
  }, []);

  async function open(e: React.MouseEvent) {
    if (!available) return; // let the plain link open a new tab
    e.preventDefault();
    try {
      const res = await fetch("/api/open-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, profile: selected }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : "Couldn't open that link.");
      window.open(url, "_blank", "noreferrer");
    }
  }

  // Same-named profiles (e.g. two "Work") are told apart by their account.
  const nameCounts = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.name] = (acc[p.name] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={open}
        className="font-medium text-accent-400 hover:underline"
      >
        View original posting ↗
      </a>
      {available ? (
        <label className="flex items-center gap-1 text-ink-faint">
          in
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              saveProfile(e.target.value);
            }}
            className="rounded-md border border-line-strong bg-base/60 px-1.5 py-0.5 text-xs text-ink-soft focus:border-accent-400 focus:outline-none"
            title="Chrome profile to open job links in"
          >
            {profiles.map((p) => (
              <option key={p.dir} value={p.dir}>
                {p.name}
                {p.email && (nameCounts[p.name] > 1 || p.email !== p.name) ? ` — ${p.email}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
