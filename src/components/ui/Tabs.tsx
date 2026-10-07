"use client";

interface TabsProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 rounded-md border border-line bg-surface/60 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-1 rounded border border-transparent px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
            active === tab.key
              ? "border border-accent-300/60 bg-accent-500/20 text-accent-50 shadow-glow"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
