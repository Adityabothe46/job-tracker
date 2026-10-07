"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  // HUD-style: translucent holographic fills with a bright cyan outline,
  // rather than solid colored slabs.
  primary:
    "border border-accent-300/70 bg-accent-500/20 text-accent-50 shadow-glow hover:bg-accent-500/30 hover:border-accent-200 disabled:opacity-40 disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface-muted/50 text-ink-soft hover:border-accent-400/60 hover:text-accent-100 disabled:text-ink-faint disabled:hover:border-line-strong",
  ghost: "text-ink-soft hover:bg-surface-muted disabled:text-ink-faint",
  danger: "text-suit-400 hover:bg-suit-500/10 disabled:text-suit-700",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
