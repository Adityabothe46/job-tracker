"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

export function ProfileTab({
  onToast,
}: {
  onToast: (message: string, tone?: "success" | "error") => void;
}) {
  const [resumeText, setResumeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setResumeText(data.profile.resume_text))
      .catch(() => onToast("Couldn't load your profile.", "error"))
      .finally(() => setLoading(false));
  }, [onToast]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text: resumeText }),
      });
      if (!res.ok) throw new Error();
      onToast("Profile saved.");
    } catch {
      onToast("Couldn't save your profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-ink-muted">
        Paste your resume or background below. It's used as context every
        time you generate a cover letter, resume bullets, interview
        questions, or a company brief for a job.
      </p>

      {loading ? (
        <div className="py-10 text-center text-sm text-ink-muted">
          Loading…
        </div>
      ) : (
        <div className="glass hud-frame rounded-md border border-line p-5 shadow-card">
          <Textarea
            rows={20}
            placeholder="Paste your resume / background here..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
