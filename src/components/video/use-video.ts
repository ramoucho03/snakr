"use client";

import { useEffect, useState } from "react";

/**
 * Client-side helpers for the YouTube-style grid.
 *
 * There used to be a `useVideoDuration` here, mounting a hidden `<video>` per
 * card to read its duration off the network. Durations now ride along with the
 * row (ffprobe measures them once, at upload) — see `VideoItem.durationSec`.
 */

/** True on devices with a real hover-capable pointer (gates hover-to-preview). */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return canHover;
}

/** The subset of NetworkInformation we use; it is not in every lib.dom yet. */
type Connection = { saveData?: boolean; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void };

/**
 * "Do not spend my bytes." Chromium exposes the Save-Data preference through
 * `navigator.connection`; Firefox and Safari only through the
 * `prefers-reduced-data` media query. Honour either.
 *
 * Resolved after mount, never during render: the server has no navigator, and a
 * render-time read would hydrate one tree and paint another.
 */
export function useSaveData(): boolean {
  const [saveData, setSaveData] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const mq = window.matchMedia?.("(prefers-reduced-data: reduce)");

    const read = () => setSaveData(Boolean(connection?.saveData) || Boolean(mq?.matches));
    read();

    connection?.addEventListener?.("change", read);
    mq?.addEventListener?.("change", read);
    return () => {
      connection?.removeEventListener?.("change", read);
      mq?.removeEventListener?.("change", read);
    };
  }, []);

  return saveData;
}
