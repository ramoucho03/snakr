"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[var(--accent-contrast)] shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-110 active:brightness-95",
  secondary:
    "glass text-text-hi hover:text-text-hi hover:brightness-125",
  ghost: "text-text-lo hover:text-text-hi hover:bg-glass",
  outline:
    "border border-glass-border text-text-hi hover:bg-glass hover:border-accent/60",
  danger:
    "bg-danger text-white shadow-[0_8px_24px_-8px_var(--danger)] hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-full grid place-items-center",
};

const BASE =
  "inline-flex items-center justify-center font-medium select-none transition-all duration-150 " +
  "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer";

/** Shared class string so `<a>`/`<Link>` can look like a button too. */
export function buttonClass(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClass({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
