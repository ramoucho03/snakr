import { cn } from "@/lib/utils";

/**
 * Pure button-style helper — deliberately NOT a "use client" module so it can be
 * called from BOTH server and client components. (The `Button` component itself,
 * which needs client-only React features, lives in ./button and re-exports this.)
 * Server components MUST import `buttonClass` from here, never from ./button:
 * calling a function exported by a "use client" module on the server throws
 * ("Attempted to call buttonClass() from the server…").
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[var(--accent-contrast)] shadow-[0_8px_24px_-10px_var(--accent)] hover:-translate-y-px hover:shadow-[0_14px_34px_-10px_var(--accent)] hover:brightness-105 active:translate-y-0 active:brightness-95",
  secondary: "glass text-text-hi hover:text-text-hi hover:brightness-125",
  ghost: "text-text-lo hover:text-text-hi hover:bg-glass",
  outline: "border border-glass-border text-text-hi hover:bg-glass hover:border-accent/60",
  danger: "bg-danger text-white shadow-[0_8px_24px_-8px_var(--danger)] hover:brightness-110",
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
