import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

const fieldClasses =
  "w-full rounded-md border border-line-strong bg-base/70 px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...rest }, ref) => (
  <input ref={ref} className={`${fieldClasses} ${className}`} {...rest} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...rest }, ref) => (
  <textarea ref={ref} className={`${fieldClasses} ${className}`} {...rest} />
));
Textarea.displayName = "Textarea";

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-ink-soft">
      {children}
    </label>
  );
}
