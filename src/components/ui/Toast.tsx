"use client";

import { useCallback, useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "success" | "error";
}

let idCounter = 0;

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "success") => {
      idCounter += 1;
      setToast({ id: idCounter, text, tone });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, showToast };
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  const tone =
    toast.tone === "error"
      ? "border-red-400/40 bg-red-950/80 text-red-200"
      : "border-accent-400/40 bg-surface/90 text-ink";
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fade-up rounded-md border ${tone} px-4 py-2.5 text-sm font-medium shadow-card-hover backdrop-blur`}
    >
      {toast.text}
    </div>
  );
}
