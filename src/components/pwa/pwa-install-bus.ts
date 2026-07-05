"use client";

/**
 * Shared install plumbing: the inline PwaCaptureScript stashes the deferred
 * `beforeinstallprompt` event on `window.__snakrBIP`; the install card AND the
 * user-menu "Installer l'application" entry both consume it from here, so an
 * install path exists even after the auto-card was dismissed or missed.
 */

export const DISMISSED_LS = "snakr:pwa:dismissed-at";
export const INSTALLED_LS = "snakr:pwa:installed";
export const IOS_ACK_LS = "snakr:pwa:ios-ack";
export const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Fired by the capture script each time Chromium hands us a fresh event. */
export const BIP_EVENT = "snakr:bip";
/** Fired by the user-menu entry to summon the iOS tutorial card on demand. */
export const IOS_CARD_EVENT = "snakr:show-ios-card";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type BipWindow = Window & { __snakrBIP?: BeforeInstallPromptEvent | null };

/* localStorage can THROW on access (cookies blocked, some webviews). A crash
   here would bubble to global-error.tsx and take the whole app down — never. */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the prompt will simply reappear next session.
  }
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return (window as BipWindow).__snakrBIP ?? null;
}

/**
 * Fire the native Chromium install dialog from the stashed event.
 * Consumes the event synchronously so a double-trigger can't call prompt()
 * twice on it (InvalidStateError).
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const w = window as BipWindow;
  const deferred = w.__snakrBIP;
  if (!deferred) return "unavailable";
  w.__snakrBIP = null;
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "dismissed") safeSet(DISMISSED_LS, String(Date.now()));
    return outcome;
  } catch {
    safeSet(DISMISSED_LS, String(Date.now()));
    return "dismissed";
  }
}

export function isStandaloneNow(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPod/iPad — including iPadOS 13+, which masquerades as macOS. */
export function isIosDevice(): boolean {
  const classic = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classic || ipadOs;
}

/** In-app browsers have no “Sur l'écran d'accueil” — the tutorial would lie. */
export function isInAppWebview(): boolean {
  return /\b(Instagram|FBAN|FBAV|FB_IAB|Line\/|GSA\/|Snapchat|Twitter)/i.test(
    navigator.userAgent,
  );
}

/** Chrome/Firefox/Edge on iOS: same gesture, but in THEIR share menu. */
export function isNonSafariIosBrowser(): boolean {
  return /CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
}

export function installSnoozed(): boolean {
  if (safeGet(INSTALLED_LS)) return true;
  const at = Number(safeGet(DISMISSED_LS) ?? 0);
  return Date.now() - at < COOLDOWN_MS;
}

/** Can THIS device/browser reach an install path at all (for the menu entry)? */
export function installEntryAvailable(): boolean {
  if (isStandaloneNow()) return false;
  if (safeGet(INSTALLED_LS)) return false;
  if (getDeferredPrompt()) return true;
  return isIosDevice() && !isInAppWebview();
}

/** Summon the iOS tutorial card (explicit user intent — bypasses snoozes). */
export function requestIosCard(): void {
  window.dispatchEvent(new Event(IOS_CARD_EVENT));
}
