import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-16 text-center",
        className,
      )}
    >
      <div className="glass grid h-16 w-16 place-items-center rounded-2xl">
        <Icon size={28} className="text-accent" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold text-text-hi">{title}</h3>
      {description && <p className="max-w-sm text-sm text-text-lo">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
