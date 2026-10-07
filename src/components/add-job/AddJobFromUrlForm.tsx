"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { JobDraft } from "@/types";

interface AddJobFromUrlFormProps {
  /** `message` is set when the job was already on the board (no copy made). */
  onCreated: (message?: string) => void;
  country: string;
  onError: (message: string) => void;
}

export function AddJobFromUrlForm({ onCreated, onError, country }: AddJobFromUrlFormProps) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<JobDraft | null>(null);

  async function handleFetch() {
    if (!url.trim()) return;
    setFetching(true);
    setDraft(null);
    try {
      const res = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that page.");
      setDraft(data.draft);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't read that page.");
    } finally {
      setFetching(false);
    }
  }

  async function handleAdd() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, source_url: url.trim(), country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save this job.");
      onCreated(data.duplicate ? data.message : undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't save this job.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Job posting URL</Label>
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://company.com/careers/role"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={fetching}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleFetch}
            disabled={fetching || !url.trim()}
          >
            {fetching ? <Spinner /> : "Fetch"}
          </Button>
        </div>
      </div>

      {draft ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-xs text-ink-muted">
            Review and edit before adding to your board:
          </p>
          <div>
            <Label>Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Company</Label>
            <Input
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={8}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleAdd} disabled={saving}>
              {saving ? <Spinner /> : "Add to board"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
