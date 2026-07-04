"use client";

import { HardDrive } from "lucide-react";
import { formatBytes, clamp, cn } from "@/lib/utils";

/** Compact storage-usage pill for the top bar. `limit === null` = unlimited. */
export function StorageMeter({
  used,
  limit,
  className,
}: {
  used: number;
  limit: number | null;
  className?: string;
}) {
  const pct = limit && limit > 0 ? clamp((used / limit) * 100, 0, 100) : null;
  const near = pct != null && pct >= 90;

  return (
    <div
      className={cn("glass hidden items-center gap-2.5 rounded-full px-3 py-1.5 sm:flex", className)}
      title={
        limit != null
          ? `${formatBytes(used)} sur ${formatBytes(limit)}`
          : `${formatBytes(used)} utilisés`
      }
    >
      <HardDrive size={15} className="text-text-lo" aria-hidden />
      {pct != null ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-glass-border">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                near ? "bg-danger" : "bg-accent",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular text-xs text-text-lo">{formatBytes(used)}</span>
        </div>
      ) : (
        <span className="tabular text-xs text-text-lo">{formatBytes(used)}</span>
      )}
    </div>
  );
}
