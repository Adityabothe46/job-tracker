"use client";

import { Input, Label } from "@/components/ui/Input";
import type { SearchPreferences } from "@/types";

interface SearchPreferencesFormProps {
  prefs: SearchPreferences;
  onChange: (prefs: SearchPreferences) => void;
}

/**
 * Controlled form — state lives in the parent (DiscoveryTab) and is shared
 * with SourceToggles, since both edit fields on the same singleton
 * search_preferences row. Saving happens from the parent so neither
 * component's save can clobber the other's unsaved edits.
 */
export function SearchPreferencesForm({
  prefs,
  onChange,
}: SearchPreferencesFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Job title / keywords</Label>
        <Input
          placeholder="e.g. Operations Engineer, Supply Chain Analyst"
          value={prefs.keywords}
          onChange={(e) => onChange({ ...prefs, keywords: e.target.value })}
        />
        <p className="mt-1 text-xs text-ink-muted">Comma-separated.</p>
      </div>
      <div>
        <Label>Locations</Label>
        <Input
          placeholder="e.g. Seattle WA, Austin TX"
          value={prefs.locations}
          onChange={(e) => onChange({ ...prefs, locations: e.target.value })}
        />
        <p className="mt-1 text-xs text-ink-muted">Comma-separated.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={!!prefs.remote_ok}
          onChange={(e) =>
            onChange({ ...prefs, remote_ok: e.target.checked ? 1 : 0 })
          }
        />
        Include remote roles
      </label>
      <div>
        <Label>Only show jobs posted within (hours)</Label>
        <Input
          type="number"
          min={1}
          value={prefs.freshness_hours}
          onChange={(e) =>
            onChange({ ...prefs, freshness_hours: Number(e.target.value) || 48 })
          }
          className="max-w-[140px]"
        />
      </div>
      <div>
        <Label>Notification email</Label>
        <Input
          type="email"
          placeholder="you@example.com"
          value={prefs.notification_email}
          onChange={(e) =>
            onChange({ ...prefs, notification_email: e.target.value })
          }
        />
      </div>
    </div>
  );
}
