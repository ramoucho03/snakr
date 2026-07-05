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
    // Self-hosters land on "why is there no install prompt?" — answer it in
    // the console instead of failing silently. The #1 cause: Chrome/Android
    // requires a TRUSTED HTTPS origin; self-signed certs and plain HTTP get
    // no service worker and therefore no install proposal, ever.
    if (!window.isSecureContext) {
      console.warn(
        `[Snak'r PWA] Origine non sécurisée (${window.location.origin}) : ` +
          "le service worker et l'installation exigent HTTPS avec un certificat " +
          "RECONNU par l'appareil (ou localhost). Aucune proposition " +
          "d'installation ne peut apparaître ici — voir la section PWA du README.",
      );
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn("[Snak'r PWA] serviceWorker non supporté par ce navigateur.");
      return;
    }

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
            // An install-phase failure means Chrome will NEVER offer the app.
            if (next.state === "redundant" && !navigator.serviceWorker.controller) {
              console.warn(
                "[Snak'r PWA] L'installation du service worker a échoué " +
                  "(précache indisponible ?) — pas de proposition d'installation possible.",
              );
            }
          });
        });
      })
      .catch((err) => {
        // Never fatal for the app — but say WHY install won't be offered.
        console.warn("[Snak'r PWA] Échec d'enregistrement du service worker :", err);
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
