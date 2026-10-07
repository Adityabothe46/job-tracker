"use client";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Generation, GenerationType } from "@/types";

interface GenerateButtonProps {
  type: GenerationType;
  label: string;
  existing?: Generation;
  loading: boolean;
  onGenerate: (type: GenerationType) => void;
}

export function GenerateButton({
  type,
  label,
  existing,
  loading,
  onGenerate,
}: GenerateButtonProps) {
  return (
    <Button
      type="button"
      variant={existing ? "secondary" : "primary"}
      onClick={() => onGenerate(type)}
      disabled={loading}
      className="w-full justify-center"
    >
      {loading ? <Spinner /> : null}
      {loading ? "Generating…" : existing ? `Regenerate ${label}` : label}
    </Button>
  );
}
