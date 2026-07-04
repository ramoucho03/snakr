"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const FIELD_BASE =
  "w-full rounded-lg bg-glass border border-glass-border px-3.5 py-2.5 text-sm text-text-hi " +
  "placeholder:text-text-faint outline-none transition-colors " +
  "focus:border-accent/70 focus:ring-2 focus:ring-accent/25 " +
  "disabled:opacity-50 aria-[invalid=true]:border-danger/70";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD_BASE, "min-h-24 resize-y", className)} {...props} />;
});

/** Label + control + inline error, wired for a11y (aria-invalid + describedby). */
export function Field({
  label,
  error,
  hint,
  htmlFor,
  required,
  children,
  className,
}: {
  label?: string;
  error?: string | null;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text-lo">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
