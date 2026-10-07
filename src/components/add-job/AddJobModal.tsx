"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { AddJobFromUrlForm } from "./AddJobFromUrlForm";
import { AddJobFromTextForm } from "./AddJobFromTextForm";

interface AddJobModalProps {
  open: boolean;
  /** Board country the new job is filed under (the header's selection). */
  country: string;
  onClose: () => void;
  /** `message` is set when the job was already on the board (no copy made). */
  onCreated: (message?: string) => void;
  onError: (message: string) => void;
}

export function AddJobModal({
  open,
  country,
  onClose,
  onCreated,
  onError,
}: AddJobModalProps) {
  const [tab, setTab] = useState<"url" | "text">("url");

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-xl">
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Add a job <span className="text-sm font-normal text-ink-muted">· {country}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink-soft"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-5">
          <Tabs
            tabs={[
              { key: "url", label: "From URL" },
              { key: "text", label: "Paste text" },
            ]}
            active={tab}
            onChange={(key) => setTab(key as "url" | "text")}
          />
        </div>

        {tab === "url" ? (
          <AddJobFromUrlForm country={country} onCreated={onCreated} onError={onError} />
        ) : (
          <AddJobFromTextForm country={country} onCreated={onCreated} onError={onError} />
        )}
      </div>
    </Modal>
  );
}
