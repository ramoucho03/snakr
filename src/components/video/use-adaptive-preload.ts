"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Adaptive start-up buffering for a progressive MP4.
 *
 * There is no ABR here — one file, one bitrate, served over HTTP Range. The only
 * levers we hold are WHEN playback starts and HOW MUCH is buffered first. So we
 * measure the download rate, compare it against the file's mean bitrate, and
 * hold the play() call until enough is buffered ahead of the playhead to absorb
 * the deficit.
 *
 * The arithmetic: while playing, the buffer drains at one second of media per
 * second of wall clock and refills at `rate / bitrate` seconds of media per
 * second. With `r = rate / bitrate`:
 *
 *   r >= 1  the buffer never empties — start as soon as a frame can decode.
 *   r <  1  the buffer loses (1 - r) seconds of media every second, so B seconds
 *           of buffer buys B / (1 - r) seconds of uninterrupted playback. To
 *           cover HORIZON seconds we need B = HORIZON * (1 - r).
 *
 * This REDUCES stalls, it cannot abolish them: a link that stays under the
 * bitrate for longer than the horizon will stall eventually whatever we do. What
 * it buys is one honest wait up front instead of a stutter every few seconds.
 */

export type PlaybackPhase = "idle" | "buffering" | "playing" | "rebuffering" | "error";

/** Seconds of playback a full buffer should protect. */
const HORIZON = 30;
/** Never wait for less than this, even on a fast link — decoders need a runway. */
const MIN_BUFFER = 2;
/** Nor for more than this, however bad the link. */
const MAX_BUFFER = 40;
/** Each stall raises the target: whatever we guessed, the network disagreed. */
const REBUFFER_STEP = 1.6;
/** A link at or above this multiple of the bitrate needs no head start. */
const FAST_RATIO = 1.2;
/** Hard ceiling on the wait. Safari lies about `canplaythrough`; never hang. */
const MAX_WAIT_MS = 12_000;
/** Below this, a fill-rate sample is TCP slow-start noise, not the link. */
const MIN_SAMPLE_MS = 400;
/** `progress` stops firing on a fully-buffered file; poll so we cannot deadlock. */
const TICK_MS = 250;

export interface AdaptivePreloadOptions {
  /** Bytes of the media file. With `durationSec` this yields the mean bitrate. */
  size?: number;
  durationSec?: number | null;
  /** Begin playback as soon as it is safe to. */
  autoPlay?: boolean;
  /** Honour Save-Data / prefers-reduced-data: never spend bytes unasked. */
  saveData?: boolean;
}

export interface AdaptivePreload {
  phase: PlaybackPhase;
  /** 0..1 — how far the buffer has come toward the target. Drives the overlay. */
  progress: number;
  /** True once we know the link cannot keep up with this file's bitrate. */
  slowLink: boolean;
  /** The user asked to play. Runs the gate (except where it cannot). */
  requestPlay: () => void;
  /** Skip the wait and roll now. */
  playNow: () => void;
  /** What belongs in the element's `preload` attribute. */
  preload: "none" | "metadata" | "auto";
  /** Wire these onto the <video>. */
  handlers: {
    onLoadedMetadata: () => void;
    onProgress: () => void;
    onPlaying: () => void;
    onWaiting: () => void;
    onPause: () => void;
    onError: () => void;
    onEnded: () => void;
  };
}

/** Seconds already buffered ahead of the playhead (0 when it sits in a gap). */
function bufferedAhead(el: HTMLVideoElement): number {
  const { buffered, currentTime } = el;
  for (let i = 0; i < buffered.length; i++) {
    // Tolerate the boundary: right after a seek the playhead lands exactly on it.
    if (buffered.start(i) <= currentTime + 0.05 && buffered.end(i) > currentTime) {
      return buffered.end(i) - currentTime;
    }
  }
  return 0;
}

/**
 * iOS Safari will not fill a buffer for a paused element: `preload` is a hint it
 * ignores on cellular, and bytes only flow once play() has run inside a user
 * gesture. Holding play() there would hold it forever, so on iOS we start
 * immediately and let the rebuffering overlay carry a slow link instead.
 */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function useAdaptivePreload(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { size, durationSec, autoPlay, saveData }: AdaptivePreloadOptions,
): AdaptivePreload {
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [slowLink, setSlowLink] = useState(false);

  // Hot-path values the evaluator touches several times a second.
  const phaseRef = useRef<PlaybackPhase>("idle");
  const targetRef = useRef(MIN_BUFFER);
  const rebuffersRef = useRef(0);
  const overrideRef = useRef(false);
  const deadlineRef = useRef(0);
  const sampleRef = useRef<{ at: number; buffered: number } | null>(null);
  const rateRef = useRef<number | null>(null); // measured bytes per second

  const bitrate = size && durationSec && durationSec > 0 ? (size * 8) / durationSec : null;

  const enter = useCallback((next: PlaybackPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** Roll the media, tolerating a browser that refuses (autoplay policy). */
  const start = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    deadlineRef.current = 0;
    void el.play().catch(() => {
      // Blocked: unmuted autoplay with no user activation. Show a Play button
      // rather than a spinner that will never resolve.
      enter("idle");
    });
  }, [videoRef, enter]);

  /** The buffer we want before letting the video roll, in seconds of media. */
  const computeTarget = useCallback(() => {
    const rate = rateRef.current;
    const backoff = REBUFFER_STEP ** rebuffersRef.current;

    if (rate == null || bitrate == null) {
      // Nothing measured yet, or no duration to derive a bitrate from. Ask for a
      // modest head start rather than pretending to know the link.
      return Math.min(MAX_BUFFER, MIN_BUFFER * 2 * backoff);
    }

    const ratio = (rate * 8) / bitrate;
    setSlowLink(ratio < 1);
    if (ratio >= FAST_RATIO) return Math.min(MAX_BUFFER, MIN_BUFFER * backoff);

    const needed = HORIZON * (1 - Math.max(0, Math.min(ratio, 1)));
    return Math.max(MIN_BUFFER, Math.min(MAX_BUFFER, needed * backoff));
  }, [bitrate]);

  /** Sample the fill rate and decide whether we have waited long enough. */
  const evaluate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;

    const ahead = bufferedAhead(el);
    const now = performance.now();

    // The rate falls out of how fast `buffered` grows; converting media seconds
    // back into bytes needs the mean bitrate, so without one we cannot measure.
    const sample = sampleRef.current;
    const filled = ahead + el.currentTime;
    if (sample && bitrate) {
      const elapsed = now - sample.at;
      if (elapsed >= MIN_SAMPLE_MS) {
        const gained = filled - sample.buffered;
        if (gained > 0) {
          const bytesPerSecond = (gained * (bitrate / 8)) / (elapsed / 1000);
          // Smooth: one sample across a TCP slow start is not the steady rate.
          rateRef.current = rateRef.current
            ? rateRef.current * 0.6 + bytesPerSecond * 0.4
            : bytesPerSecond;
        }
        sampleRef.current = { at: now, buffered: filled };
      }
    } else {
      sampleRef.current = { at: now, buffered: filled };
    }

    const gating = phaseRef.current === "buffering" || phaseRef.current === "rebuffering";
    if (!gating || !el.paused) return;

    targetRef.current = computeTarget();
    setProgress(Math.min(1, ahead / targetRef.current));

    const enough = ahead >= targetRef.current && el.readyState >= 3; // HAVE_FUTURE_DATA
    const timedOut = deadlineRef.current > 0 && now >= deadlineRef.current;
    // A whole short clip counts: 30 seconds of buffer is unreachable in a 10s video.
    const wholeFile = el.duration > 0 && ahead >= el.duration - el.currentTime - 0.25;

    if (enough || timedOut || wholeFile || overrideRef.current) start();
  }, [videoRef, bitrate, computeTarget, start]);

  /** Enter (re)buffering: pause, arm the deadline, wait for the target. */
  const beginBuffering = useCallback(
    (next: "buffering" | "rebuffering") => {
      const el = videoRef.current;
      if (!el) return;
      overrideRef.current = false;
      deadlineRef.current = performance.now() + MAX_WAIT_MS;
      sampleRef.current = null;
      targetRef.current = computeTarget();
      setProgress(0);
      enter(next);
      // The whole gate rests on the element filling its buffer while paused, and
      // it only does that under `preload="auto"`. The attribute may say
      // "metadata" (no autoplay was asked for), so raise it now.
      if (el.preload !== "auto") el.preload = "auto";
      if (!el.paused) el.pause();
    },
    [videoRef, computeTarget, enter],
  );

  /**
   * A user press. On iOS the gesture IS the permission to fetch bytes, so play()
   * has to happen synchronously here. Everywhere else the click has granted the
   * page user activation, and a later play() will be allowed — so we can wait.
   */
  const requestPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isIos() || el.readyState >= 4 || bufferedAhead(el) >= targetRef.current) {
      start();
      return;
    }
    beginBuffering("buffering");
  }, [videoRef, start, beginBuffering]);

  const playNow = useCallback(() => {
    overrideRef.current = true;
    start();
  }, [start]);

  const onLoadedMetadata = useCallback(() => {
    if (saveData || !autoPlay) {
      enter("idle");
      return;
    }
    if (isIos()) start();
    else beginBuffering("buffering");
  }, [saveData, autoPlay, beginBuffering, start, enter]);

  const onWaiting = useCallback(() => {
    // The browser ran dry. Whatever target we picked was too small.
    if (phaseRef.current !== "playing") return;
    rebuffersRef.current += 1;
    beginBuffering("rebuffering");
  }, [beginBuffering]);

  const onPlaying = useCallback(() => {
    deadlineRef.current = 0;
    enter("playing");
  }, [enter]);

  const onPause = useCallback(() => {
    // Our own pause() already set the phase; only a user pause lands on idle.
    if (phaseRef.current === "buffering" || phaseRef.current === "rebuffering") return;
    enter("idle");
  }, [enter]);

  const onError = useCallback(() => enter("error"), [enter]);
  const onEnded = useCallback(() => enter("idle"), [enter]);

  // `progress` stops firing once the file is fully buffered — a short clip could
  // otherwise sit in `buffering` forever waiting for an event that never comes.
  useEffect(() => {
    if (phase !== "buffering" && phase !== "rebuffering") return;
    const timer = setInterval(evaluate, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, evaluate]);

  // A new source is a new measurement problem.
  useEffect(() => {
    rebuffersRef.current = 0;
    rateRef.current = null;
    sampleRef.current = null;
    overrideRef.current = false;
    targetRef.current = MIN_BUFFER;
    setSlowLink(false);
    setProgress(0);
  }, [size, durationSec]);

  return {
    phase,
    progress,
    slowLink,
    requestPlay,
    playNow,
    // `auto` is what lets a paused element fill its buffer while we hold play().
    preload: saveData ? "none" : autoPlay ? "auto" : "metadata",
    handlers: { onLoadedMetadata, onProgress: evaluate, onPlaying, onWaiting, onPause, onError, onEnded },
  };
}
