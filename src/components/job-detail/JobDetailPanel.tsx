"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  GENERATION_LABELS,
  GENERATION_TYPES,
  JOB_STATUSES,
  STATUS_LABELS,
  type Generation,
  type GenerationType,
  type Job,
  type JobStatus,
} from "@/types";
import { GenerateButton } from "./GenerateButton";
import { GeneratedContentBlock } from "./GeneratedContentBlock";
import { OpenPostingLink } from "./OpenPostingLink";

interface JobDetailPanelProps {
  jobId: string | null;
  onClose: () => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
  onDeleted: (jobId: string) => void;
  onError: (message: string) => void;
  /** Countries offered in the "move to another country's board" select. */
  countryOptions: string[];
  onCountryChange: () => void;
}

export function JobDetailPanel({
  jobId,
  countryOptions,
  onCountryChange,
  onClose,
  onStatusChange,
  onDeleted,
  onError,
}: JobDetailPanelProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [generations, setGenerations] = useState<
    Partial<Record<GenerationType, Generation>>
  >({});
  const [loadingType, setLoadingType] = useState<GenerationType | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setGenerations({});
      return;
    }
    setLoadingJob(true);
    fetch(`/api/jobs/${jobId}`)
      .then((res) => res.json())
      .then((data) => {
        setJob(data.job);
        const map: Partial<Record<GenerationType, Generation>> = {};
        for (const g of data.generations as Generation[]) {
          map[g.type] = g;
        }
        setGenerations(map);
      })
      .catch(() => onError("Couldn't load this job."))
      .finally(() => setLoadingJob(false));
  }, [jobId, onError]);

  async function handleGenerate(type: GenerationType) {
    if (!job) return;
    setLoadingType(type);
    try {
      const res = await fetch(`/api/jobs/${job.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setGenerations((prev) => ({ ...prev, [type]: data.generation }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoadingType(null);
    }
  }

  async function handleStatusChange(status: JobStatus) {
    if (!job) return;
    const previous = job.status;
    setJob({ ...job, status });
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Couldn't update status.");
      onStatusChange(job.id, status);
    } catch (err) {
      setJob({ ...job, status: previous });
      onError(err instanceof Error ? err.message : "Couldn't update status.");
    }
  }

  async function handleCountryChange(country: string) {
    if (!job) return;
    const previous = job.country;
    setJob({ ...job, country });
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      });
      if (!res.ok) throw new Error("Couldn't change the country.");
      onCountryChange();
    } catch (err) {
      setJob({ ...job, country: previous });
      onError(err instanceof Error ? err.message : "Couldn't change the country.");
    }
  }

  async function handleDelete() {
    if (!job) return;
    if (!window.confirm(`Delete "${job.title}" at ${job.company}? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete this job.");
      onDeleted(job.id);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't delete this job.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={!!jobId} onClose={onClose} maxWidthClass="max-w-2xl">
      {loadingJob || !job ? (
        <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>
      ) : (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{job.title}</h2>
              <p className="text-sm text-ink-muted">{job.company || "—"}</p>
              {job.source_url ? (
                <OpenPostingLink url={job.source_url} onError={onError} />
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="text-ink-muted hover:text-ink-soft"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
              className="rounded-md border border-line-strong bg-base/60 px-2.5 py-1.5 text-sm text-ink-soft focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={job.country}
              onChange={(e) => handleCountryChange(e.target.value)}
              title="Which country's board this job is on"
              className="rounded-md border border-line-strong bg-base/60 px-2.5 py-1.5 text-sm text-ink-soft focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              {[...new Set([job.country, ...countryOptions])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              Delete
            </Button>
          </div>

          <details className="mb-5 rounded-lg border border-line bg-surface-muted p-3.5">
            <summary className="cursor-pointer text-sm font-medium text-ink-soft">
              Job posting
            </summary>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
              {job.description}
            </p>
          </details>

          <div className="mb-2 text-sm font-semibold text-ink-soft">Generate</div>
          <div className="grid grid-cols-2 gap-2.5">
            {GENERATION_TYPES.map((type) => (
              <GenerateButton
                key={type}
                type={type}
                label={GENERATION_LABELS[type]}
                existing={generations[type]}
                loading={loadingType === type}
                onGenerate={handleGenerate}
              />
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {GENERATION_TYPES.filter((type) => generations[type]).map((type) => (
              <div key={type}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {GENERATION_LABELS[type]}
                </p>
                <GeneratedContentBlock generation={generations[type]!} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
