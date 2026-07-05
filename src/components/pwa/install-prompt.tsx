"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Share, SquarePlus, X, Zap, WifiOff, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { onUpdateBanner } from "./overlay-signal";

/**
 * Branded install proposal, shown only when it can actually lead somewhere:
 *  - Chromium (Android / desktop): captures `beforeinstallprompt`, defers it,
 *    and fires the native install dialog from our own designed card.
 *  - iOS/iPadOS (Safari or third-party — all WebKit): no install API exists,
 *    so the card teaches the "Partager → Sur l'écran d'accueil" gesture.
 *    In-app webviews (Instagram, Gmail…) can't install at all → never shown.
 * Never rendered inside an installed app (standalone), after an install,
 * within 14 days of a dismissal, over the update banner, or over an open
 * dialog — an install nudge must stay a nudge.
 */

const DISMISSED_LS = "snakr:pwa:dismissed-at";
const INSTALLED_LS = "snakr:pwa:installed";
const IOS_ACK_LS = "snakr:pwa:ios-ack";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 3000;
const BUSY_RETRY_MS = 20000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* localStorage can THROW on access (cookies blocked, some webviews). A crash
   here would bubble to global-error.tsx and take the whole app down — never. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the card will simply reappear next session.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPod/iPad — including iPadOS 13+, which masquerades as macOS. */
function isIos(): boolean {
  const classic = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classic || ipadOs;
}

/** In-app browsers have no “Sur l'écran d'accueil” — the tutorial would lie. */
function isInAppWebview(): boolean {
  return /\b(Instagram|FBAN|FBAV|FB_IAB|Line\/|GSA\/|Snapchat|Twitter)/i.test(
    navigator.userAgent,
  );
}

/** Chrome/Firefox/Edge on iOS: same gesture, but in THEIR share menu. */
function isNonSafariIosBrowser(): boolean {
  return /CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
}

function snoozed(): boolean {
  if (safeGet(INSTALLED_LS)) return true;
  const at = Number(safeGet(DISMISSED_LS) ?? 0);
  return Date.now() - at < COOLDOWN_MS;
}

/** Radix dialogs are z-50 and focus-trapped — never float the card over one. */
function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

const PERKS = [
  { icon: Zap, label: "Lancement instantané" },
  { icon: MonitorSmartphone, label: "Plein écran, sans navigateur" },
  { icon: WifiOff, label: "Résiste aux coupures" },
] as const;

export function InstallPrompt() {
  const [mode, setMode] = useState<"native" | "ios" | null>(null);
  const [bannerUp, setBannerUp] = useState(false);
  const [genericShareMenu, setGenericShareMenu] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    // Show, unless something more important is on screen — then retry later.
    const tryShow = (m: "native" | "ios") => {
      if (snoozed()) return;
      if (dialogOpen()) {
        later(() => tryShow(m), BUSY_RETRY_MS);
        return;
      }
      setMode(m);
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      later(() => tryShow("native"), SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      safeSet(INSTALLED_LS, "1");
      deferredRef.current = null;
      setMode(null);
      toast.success("Snak'r est installé sur cet appareil");
    };
    window.addEventListener("appinstalled", onInstalled);

    if (isIos() && !isInAppWebview() && !safeGet(IOS_ACK_LS)) {
      setGenericShareMenu(isNonSafariIosBrowser());
      later(() => tryShow("ios"), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      timers.forEach(clearTimeout);
    };
  }, []);

  // Duck under the update banner; come back when it's gone.
  useEffect(() => onUpdateBanner(setBannerUp), []);

  // Escape closes the card, like any polite overlay.
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function dismiss() {
    safeSet(DISMISSED_LS, String(Date.now()));
    setMode(null);
  }

  /** iOS "J'ai compris": it's a tutorial, acknowledged once — never re-nag. */
  function acknowledgeIos() {
    safeSet(IOS_ACK_LS, "1");
    setMode(null);
  }

  async function install() {
    const deferred = deferredRef.current;
    if (!deferred) return;
    // Consume synchronously: a second click during the exit animation must not
    // call prompt() twice (InvalidStateError on an already-used event).
    deferredRef.current = null;
    setMode(null);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // Accepted → the `appinstalled` listener celebrates; declined → snooze.
      if (outcome === "dismissed") dismissQuietly();
    } catch {
      dismissQuietly();
    }
  }

  function dismissQuietly() {
    safeSet(DISMISSED_LS, String(Date.now()));
  }

  const visible = mode !== null && !bannerUp;

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="glass-strong glass-sheen fixed inset-x-4 bottom-4 z-[90] rounded-2xl p-4 sm:left-auto sm:right-6 sm:w-[24rem] sm:p-5"
          aria-label="Installer l'application"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fermer"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-text-faint transition-colors hover:bg-glass hover:text-text-hi"
          >
            <X size={15} />
          </button>

          <div className="flex items-center gap-3 pr-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/icon-192.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-xl border border-glass-border"
            />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-text-hi">
                Installer Snak&apos;r
              </p>
              <p className="text-xs text-text-lo">
                L&apos;application complète, sur votre écran d&apos;accueil.
              </p>
            </div>
          </div>

          {mode === "native" ? (
            <>
              <ul className="mt-4 flex flex-col gap-1.5">
                {PERKS.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2 text-xs text-text-lo">
                    <Icon size={13} className="shrink-0 text-tan" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Plus tard
                </Button>
                <Button size="sm" onClick={() => void install()}>
                  <Download size={15} /> Installer
                </Button>
              </div>
            </>
          ) : (
            <>
              <ol className="mt-4 flex flex-col gap-2.5">
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-lo">
                  <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-glass text-xs font-semibold text-text-hi">
                    1
                  </span>
                  Touchez
                  <span className="inline-flex items-center gap-1 rounded-md bg-glass px-1.5 py-0.5 text-text-hi">
                    <Share size={13} aria-hidden /> Partager
                  </span>
                  {genericShareMenu ? "dans le menu de votre navigateur" : "dans Safari"}
                </li>
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-lo">
                  <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-glass text-xs font-semibold text-text-hi">
                    2
                  </span>
                  Choisissez
                  <span className="inline-flex items-center gap-1 rounded-md bg-glass px-1.5 py-0.5 text-text-hi">
                    <SquarePlus size={13} aria-hidden /> Sur l&apos;écran d&apos;accueil
                  </span>
                </li>
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-lo">
                  <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-glass text-xs font-semibold text-text-hi">
                    3
                  </span>
                  Touchez « Ajouter » — c&apos;est tout.
                </li>
              </ol>
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="secondary" onClick={acknowledgeIos}>
                  J&apos;ai compris
                </Button>
              </div>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
