"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Route-level error boundary. Catches unhandled errors thrown while rendering a
 * segment (server or client) and offers a retry + a way home instead of a blank
 * screen. `reset()` re-renders the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <GlassCard strong className="flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-danger/10">
          <AlertTriangle size={30} className="text-danger" />
        </div>
        <h1 className="font-display text-xl font-semibold text-text-hi">
          Une erreur est survenue
        </h1>
        <p className="max-w-sm text-sm text-text-lo">
          Quelque chose s'est mal passé. Réessayez, ou revenez à votre drive.
        </p>
        {error.digest && (
          <p className="tabular text-xs text-text-faint">Référence : {error.digest}</p>
        )}
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={reset}>
            <RotateCw size={16} /> Réessayer
          </Button>
          <Link href="/drive">
            <Button>Mon drive</Button>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
