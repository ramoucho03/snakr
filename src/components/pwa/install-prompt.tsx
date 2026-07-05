"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Share, SquarePlus, X, Zap, WifiOff, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { onUpdateBanner } from "./overlay-signal";
import {
  BIP_EVENT,
  IOS_CARD_EVENT,
  DISMISSED_LS,
  INSTALLED_LS,
  IOS_ACK_LS,
  getDeferredPrompt,
  promptInstall,
  installSnoozed,
  isStandaloneNow,
  isIosDevice,
  isInAppWebview,
  isNonSafariIosBrowser,
  safeGet,
  safeSet,
} from "./pwa-install-bus";

/**
 * Branded install proposal, shown only when it can actually lead somewhere:
 *  - Chromium (Android / desktop): the nonce'd PwaCaptureScript stashes
 *    `beforeinstallprompt` before hydration; we fire the native dialog from
 *    our own designed card (and from the user-menu entry at any time).
 *  - iOS/iPadOS (Safari or third-party — all WebKit): no install API exists,
 *    so the card teaches the "Partager → Sur l'écran d'accueil" gesture.
 *    In-app webviews (Instagram, Gmail…) can't install at all → never shown.
 * Never rendered inside an installed app (standalone), after an install,
 * within 14 days of a dismissal, over the update banner, or over an open
 * dialog — an install nudge must stay a nudge. The user-menu entry bypasses
 * the snoozes (explicit intent).
 */

const SHOW_DELAY_MS = 3000;
const BUSY_RETRY_MS = 20000;

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

  useEffect(() => {
    if (isStandaloneNow()) return;

    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    // Show, unless something more important is on screen — then retry later.
    // `force` = explicit user intent (menu entry): ignores the snoozes.
    const tryShow = (m: "native" | "ios", force = false) => {
      if (!force && installSnoozed()) return;
      if (dialogOpen()) {
        later(() => tryShow(m, force), BUSY_RETRY_MS);
        return;
      }
      setMode(m);
    };

    // Chromium: the capture script may have stashed the event BEFORE we
    // mounted (fast fire) — check; otherwise wait for its re-notification.
    if (getDeferredPrompt()) later(() => tryShow("native"), SHOW_DELAY_MS);
    const onBip = () => later(() => tryShow("native"), SHOW_DELAY_MS);
    window.addEventListener(BIP_EVENT, onBip);

    const onInstalled = () => {
      safeSet(INSTALLED_LS, "1");
      setMode(null);
      toast.success("Snak'r est installé sur cet appareil");
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS tutorial: auto once (until acknowledged), any time via the menu.
    const iosEligible = isIosDevice() && !isInAppWebview();
    if (iosEligible) setGenericShareMenu(isNonSafariIosBrowser());
    if (iosEligible && !safeGet(IOS_ACK_LS)) {
      later(() => tryShow("ios"), SHOW_DELAY_MS);
    }
    const onIosCardRequest = () => {
      if (iosEligible) tryShow("ios", true);
    };
    window.addEventListener(IOS_CARD_EVENT, onIosCardRequest);

    return () => {
      window.removeEventListener(BIP_EVENT, onBip);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(IOS_CARD_EVENT, onIosCardRequest);
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
    setMode(null);
    await promptInstall();
    // Accepted → the `appinstalled` listener celebrates; declined → the bus
    // already snoozed. Nothing else to do here.
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
