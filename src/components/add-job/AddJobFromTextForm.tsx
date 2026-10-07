"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface AddJobFromTextFormProps {
  /** `message` is set when the job was already on the board (no copy made). */
  onCreated: (message?: string) => void;
  country: string;
  onError: (message: string) => void;
}

export function AddJobFromTextForm({ onCreated, onError, country }: AddJobFromTextFormProps) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!title.trim() || !description.trim()) {
      onError("Title and description are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          company: company.trim(),
          description: description.trim(),
          country,
        }),
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
    <div className="space-y-3">
      <div>
        <Label>Title</Label>
        <Input
          placeholder="Senior Product Designer"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <Label>Company</Label>
        <Input
          placeholder="Acme Inc."
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <div>
        <Label>Job posting text</Label>
        <Textarea
          rows={10}
          placeholder="Paste the full job posting here..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={handleAdd} disabled={saving}>
          {saving ? <Spinner /> : "Add to board"}
        </Button>
      </div>
    </div>
  );
}
