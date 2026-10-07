"use client";

import type { SearchPreferences } from "@/types";

interface SourceTogglesProps {
  prefs: SearchPreferences;
  onChange: (prefs: SearchPreferences) => void;
}

function Toggle({
  label,
  checked,
  onChange,
  warning,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  warning?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {warning ? (
          <p className="mt-0.5 text-xs text-amber-400">{warning}</p>
        ) : null}
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-surface-strong transition-colors peer-checked:bg-accent-600" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </label>
    </div>
  );
}

export function SourceToggles({ prefs, onChange }: SourceTogglesProps) {
  return (
    <div className="divide-y divide-line">
      <Toggle
        label="Company boards"
        checked={!!prefs.source_company_boards_enabled}
        onChange={(checked) =>
          onChange({ ...prefs, source_company_boards_enabled: checked ? 1 : 0 })
        }
      />
      <Toggle
        label="LinkedIn"
        checked={!!prefs.source_linkedin_enabled}
        onChange={(checked) =>
          onChange({ ...prefs, source_linkedin_enabled: checked ? 1 : 0 })
        }
        warning="Best-effort — LinkedIn actively blocks scraping; may fail silently or stop working without notice."
      />
      <Toggle
        label="Indeed"
        checked={!!prefs.source_indeed_enabled}
        onChange={(checked) =>
          onChange({ ...prefs, source_indeed_enabled: checked ? 1 : 0 })
        }
        warning="Best-effort — same caveats as LinkedIn."
      />
    </div>
  );
}
