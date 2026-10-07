"use client";

import { Input, Label, Textarea } from "@/components/ui/Input";
import { JOB_WATCH_MAX_AGE_DAYS } from "@/lib/discovery/job-watch-defaults";
import type { SearchPreferences } from "@/types";

interface JobWatchSettingsProps {
  prefs: SearchPreferences;
  onChange: (prefs: SearchPreferences) => void;
}

/**
 * Controlled like SearchPreferencesForm — edits the same singleton
 * search_preferences row, saved from DiscoveryTab.
 */
export function JobWatchSettings({ prefs, onChange }: JobWatchSettingsProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        Claude searches the web for new roles at these companies and at every company already
        on your board. New finds land at the top of Wishlist marked{" "}
        <span className="font-medium">New</span>. Only postings from the last{" "}
        {JOB_WATCH_MAX_AGE_DAYS} days are kept, newest first, and jobs you delete are never
        suggested again. One line per entry.
      </p>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={!!prefs.job_watch_enabled}
          onChange={(e) => onChange({ ...prefs, job_watch_enabled: e.target.checked ? 1 : 0 })}
        />
        Run Job Watch automatically
      </label>
      <div className="flex flex-wrap gap-4">
        <div>
          <Label>US search time(s)</Label>
          <Input
            type="text"
            placeholder="09:00"
            value={prefs.job_watch_times}
            onChange={(e) => onChange({ ...prefs, job_watch_times: e.target.value })}
            className="max-w-[160px]"
          />
        </div>
        <div>
          <Label>Other countries search time(s)</Label>
          <Input
            type="text"
            placeholder="16:00"
            value={prefs.job_watch_times_intl}
            onChange={(e) => onChange({ ...prefs, job_watch_times_intl: e.target.value })}
            className="max-w-[160px]"
          />
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        24-hour local times, comma-separated. Each runs on its own schedule — one session for
        the US, one per country. A search starts when you open the board after its time has
        passed (the app can only search while it’s open), so a slot missed overnight runs on
        your next open. Leave a field empty to only search it via “Refresh jobs”.
      </p>
      <div>
        <Label>Priority companies (searched first, widest range of roles)</Label>
        <Textarea
          rows={3}
          value={prefs.job_watch_priority_companies}
          onChange={(e) => onChange({ ...prefs, job_watch_priority_companies: e.target.value })}
        />
      </div>
      <div>
        <Label>Other target companies</Label>
        <Textarea
          rows={6}
          value={prefs.job_watch_companies}
          onChange={(e) => onChange({ ...prefs, job_watch_companies: e.target.value })}
        />
      </div>
      <div>
        <Label>Role types to look for</Label>
        <Textarea
          rows={5}
          value={prefs.job_watch_roles}
          onChange={(e) => onChange({ ...prefs, job_watch_roles: e.target.value })}
        />
      </div>
      <div>
        <Label>International countries (each gets its own board + ~15 jobs/day)</Label>
        <Textarea
          rows={4}
          value={prefs.job_watch_countries}
          onChange={(e) => onChange({ ...prefs, job_watch_countries: e.target.value })}
        />
        <p className="mt-1 text-xs text-ink-faint">
          The United States is always included (~25 jobs/day). Each extra country is one more
          Claude search per run on your seat.
        </p>
      </div>
    </div>
  );
}
