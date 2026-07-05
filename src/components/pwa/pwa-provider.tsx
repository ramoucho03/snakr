"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setUpdateBannerVisible } from "./overlay-signal";

/**
 * Registers the service worker (production only — a SW would fight HMR in dev)
 * and surfaces a branded "update available" banner when a new build is waiting.
 * Clicking it tells the waiting worker to skipWaiting(); we then reload ONCE.
 *
 * Reload guard: `clients.claim()` in sw.js fires `controllerchange` on the very
 * FIRST install too (controller flips null → worker). Reloading there would
 * yank the page out from under every new visitor — so we only reload when the
 * page was already controlled at load time, or when the user explicitly asked.
 */
export function PwaProvider() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const wantReload = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // A production build served earlier on this origin (e.g. the Docker
      // image on :3000) leaves a controlling SW that would serve stale assets
      // and the offline page to `next dev` — purge any leftover registration.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
      return;
    }

    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      // First-install claim() — not an update. Never reload a fresh visit.
      if (!hadController && !wantReload.current) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A worker already parked from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(next);
            }
          });
        });
      })
      .catch(() => {
        // Registration failing (old browser, private mode) is never fatal.
      });

    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  // Let the install card duck out of the way while the banner is up.
  useEffect(() => {
    setUpdateBannerVisible(!!waiting);
    return () => setUpdateBannerVisible(false);
  }, [waiting]);

  return (
    <AnimatePresence>
      {waiting && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="glass-strong fixed inset-x-4 bottom-4 z-[95] flex items-center gap-3 rounded-2xl px-4 py-3 sm:left-auto sm:right-6 sm:w-[22rem]"
          role="status"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-glass text-tan">
            <RefreshCw size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-hi">Nouvelle version disponible</p>
            <p className="text-xs text-text-faint">Un rechargement suffit.</p>
          </div>
          <Button
            size="sm"
            loading={updating}
            onClick={() => {
              setUpdating(true);
              wantReload.current = true;
              waiting.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Mettre à jour
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
