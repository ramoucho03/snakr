"use client";

import { Spinner } from "@/components/ui/spinner";

/**
 * Loading placeholder shown while a lazily-imported viewer chunk downloads.
 * Every `next/dynamic` viewer points its `loading` slot here so opening a file
 * never flashes a blank body.
 */
export function ViewerSkeleton({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="grid h-full min-h-[240px] w-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-text-lo">
        <Spinner size={22} />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
