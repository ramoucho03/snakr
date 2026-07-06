"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, type ButtonVariant, type ButtonSize } from "./button-variants";

// Re-exported so existing CLIENT imports (`import { buttonClass } from
// "@/components/ui/button"`) keep working. SERVER components must import
// buttonClass from "./button-variants" instead — see that file's note.
export { buttonClass };
export type { ButtonVariant, ButtonSize };

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
