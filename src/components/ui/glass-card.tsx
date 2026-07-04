import { cn } from "@/lib/utils";

/**
 * The canonical glass panel (6-layer recipe lives in globals.css `.glass`).
 * Use `strong` for elevated surfaces (modals, floating menus).
 */
export function GlassCard({
  strong,
  sheen,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; sheen?: boolean }) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        sheen && "glass-sheen",
        "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
