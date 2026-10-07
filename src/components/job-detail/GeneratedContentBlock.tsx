"use client";

import { useState } from "react";
import type { Generation } from "@/types";
import { timeAgo } from "@/lib/format";

export function GeneratedContentBlock({ generation }: { generation: Generation }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(generation.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-line bg-surface-muted p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-ink-muted">
          Generated {timeAgo(generation.created_at)}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs font-medium text-accent-400 hover:text-accent-300"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {generation.content}
      </p>
    </div>
  );
}
