export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Default colors apply only when the caller doesn't pass its own — two
  // competing bg-*/text-* utilities resolve by stylesheet order, not by
  // class-string order, so appending an override doesn't reliably win.
  const defaultColors = /\bbg-/.test(className) ? "" : "bg-surface-muted text-ink-soft";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${defaultColors} ${className}`}
    >
      {children}
    </span>
  );
}
