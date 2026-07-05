"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Client-only helpers for the YouTube-style grid. Durations aren't stored (the
 * thumbnail Derivative only keeps a poster frame), so we read them lazily from
 * the browser's own metadata parse of the same authenticated stream, gated by an
 * IntersectionObserver so a large grid never probes every video at once. Results
 * are memoized in a module-level cache that survives navigation within the SPA.
 */

const durationCache = new Map<string, number>();

/** Read a video's duration (seconds) lazily once `enabled`. Cached across cards. */
export function useVideoDuration(fileId: string, enabled: boolean): number | null {
  const [duration, setDuration] = useState<number | null>(
    () => durationCache.get(fileId) ?? null,
  );

  useEffect(() => {
    if (!enabled || durationCache.has(fileId)) {
      const cached = durationCache.get(fileId);
      if (cached != null) setDuration(cached);
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let settled = false;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load(); // abort the in-flight metadata fetch
    };
    const onMeta = () => {
      if (settled) return;
      settled = true;
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        durationCache.set(fileId, d);
        setDuration(d);
      }
      cleanup();
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);
    video.src = `/api/files/${fileId}`;

    return () => {
      settled = true;
      cleanup();
    };
  }, [fileId, enabled]);

  return duration;
}

/** True once the referenced element has scrolled near the viewport (once). */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}

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
