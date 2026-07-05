/**
 * Client-side watch-progress store (localStorage). Powers "Continuer à regarder",
 * resume-on-open, and the red-line progress bars on thumbnails — the little
 * touches that make the video section feel like a real social video network.
 * Every function guards against SSR and disabled/quota-full storage.
 */

export interface WatchProgress {
  /** Last position, seconds. */
  t: number;
  /** Total duration, seconds. */
  d: number;
  /** Updated-at (epoch ms) — used to order "continue watching" by recency. */
  at: number;
}

const KEY = "snakr:progress";
const MAX_ENTRIES = 60;

function readAll(): Record<string, WatchProgress> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Record<string, WatchProgress>;
  } catch {
    return {};
  }
}

function writeAll(store: Record<string, WatchProgress>): void {
  if (typeof window === "undefined") return;
  try {
    // Keep only the most-recently-touched entries so the key can't grow forever.
    const trimmed = Object.entries(store)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export function getAllProgress(): Record<string, WatchProgress> {
  return readAll();
}

export function getProgress(id: string): WatchProgress | null {
  return readAll()[id] ?? null;
}

/** Fraction watched in [0,1] (0 when unknown). */
export function progressFraction(p: WatchProgress | null | undefined): number {
  if (!p || p.d <= 0) return 0;
  return Math.min(Math.max(p.t / p.d, 0), 1);
}

/** Persist a position; drops the entry once basically finished or barely started. */
export function saveProgress(id: string, t: number, d: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0) return;
  const store = readAll();
  if (t < 5 || t >= d * 0.97) {
    delete store[id];
  } else {
    store[id] = { t, d, at: Date.now() };
  }
  writeAll(store);
}

export function clearProgress(id: string): void {
  const store = readAll();
  if (store[id]) {
    delete store[id];
    writeAll(store);
  }
}
