"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input, Label } from "@/components/ui/Input";
import type { SearchPreferences } from "@/types";
import { SearchPreferencesForm } from "./SearchPreferencesForm";
import { SourceToggles } from "./SourceToggles";
import { WatchedBoardsManager } from "./WatchedBoardsManager";
import { ScanStatusPanel } from "./ScanStatusPanel";
import { JobWatchSettings } from "./JobWatchSettings";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass hud-frame rounded-md border border-line p-5 shadow-card">
      <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">{title}</h2>
      {children}
    </div>
  );
}

export function DiscoveryTab({
  onToast,
}: {
  onToast: (message: string, tone?: "success" | "error") => void;
}) {
  const [prefs, setPrefs] = useState<SearchPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/search-preferences")
      .then((res) => res.json())
      .then((data) => setPrefs(data.preferences))
      .catch(() => onToast("Couldn't load search preferences.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/search-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setPrefs(data.preferences);
      onToast("Search preferences saved.");
    } catch {
      onToast("Couldn't save search preferences.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs) {
    return (
      <div className="py-10 text-center text-sm text-ink-muted">Loading…</div>
    );
  }

  return (
    <div className="space-y-5">
      <Card title="Search preferences">
        <SearchPreferencesForm prefs={prefs} onChange={setPrefs} />
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner /> : "Save"}
          </Button>
        </div>
      </Card>

      <Card title="Daily goal">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Applications per day</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={prefs.daily_goal}
              onChange={(e) =>
                setPrefs({ ...prefs, daily_goal: Math.max(0, Number(e.target.value) || 0) })
              }
              className="max-w-[140px]"
            />
          </div>
          <p className="pb-2 text-xs text-ink-muted">
            Drives the progress ring and streak on the board. Set 0 for no goal.
          </p>
          <div className="ml-auto">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner /> : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Job Watch (daily web search)">
        <JobWatchSettings prefs={prefs} onChange={setPrefs} />
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner /> : "Save"}
          </Button>
        </div>
      </Card>

      <Card title="Sources">
        <SourceToggles prefs={prefs} onChange={setPrefs} />
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner /> : "Save"}
          </Button>
        </div>
      </Card>

      <Card title="Watched company boards">
        <WatchedBoardsManager onToast={onToast} />
      </Card>

      <Card title="Scan status">
        <ScanStatusPanel onToast={onToast} />
      </Card>
    </div>
  );
}
