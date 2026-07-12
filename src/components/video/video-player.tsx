"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  Orbit,
  RotateCw,
  Crosshair,
  Loader2,
  Move,
  Gauge,
  Repeat,
  PictureInPicture2,
  Download,
  TriangleAlert,
  Rewind,
  FastForward,
} from "lucide-react";
import { cn, clamp, formatDuration } from "@/lib/utils";
import { useAdaptivePreload, type PlaybackPhase } from "./use-adaptive-preload";

/* ===========================================================================
   Equirectangular 360 renderer — a dependency-free WebGL ray-caster.
   Instead of a sphere mesh, we draw ONE fullscreen triangle and, per fragment,
   turn the pixel + camera (yaw/pitch/fov) into a view ray, map it to
   equirectangular UV, and sample the video texture. Cheap, seam-clean on WebGL2.
   =========================================================================== */

const VERT_SRC = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG_SRC = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uYaw;
uniform float uPitch;
uniform float uFov;
const float PI = 3.14159265358979323846;
void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  float t = tan(uFov * 0.5);
  vec3 dir = normalize(vec3(ndc.x * t * aspect, ndc.y * t, -1.0));
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 d1 = vec3(dir.x, dir.y * cp - dir.z * sp, dir.y * sp + dir.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 d = vec3(d1.x * cy + d1.z * sy, d1.y, -d1.x * sy + d1.z * cy);
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 st = vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
  gl_FragColor = texture2D(uTex, st);
}
`;

class Sphere360 {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private uRes: WebGLUniformLocation | null;
  private uYaw: WebGLUniformLocation | null;
  private uPitch: WebGLUniformLocation | null;
  private uFov: WebGLUniformLocation | null;
  private uTex: WebGLUniformLocation | null;
  private buffer: WebGLBuffer;

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement,
  ) {
    const gl =
      (canvas.getContext("webgl2", { antialias: true, alpha: false }) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", { antialias: true, alpha: false }) as WebGLRenderingContext | null);
    if (!gl) throw new Error("WebGL indisponible");
    this.gl = gl;
    const isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;

    const vs = this.compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "link");
    }
    this.program = program;

    // Fullscreen triangle.
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("buffer");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uRes = gl.getUniformLocation(program, "uRes");
    this.uYaw = gl.getUniformLocation(program, "uYaw");
    this.uPitch = gl.getUniformLocation(program, "uPitch");
    this.uFov = gl.getUniformLocation(program, "uFov");
    this.uTex = gl.getUniformLocation(program, "uTex");

    const texture = gl.createTexture();
    if (!texture) throw new Error("texture");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Longitude wraps; WebGL2 allows REPEAT on non-power-of-two video frames.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isGL2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 1px placeholder until the first frame is available.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "compile");
    }
    return shader;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Upload the current video frame. Returns false if no frame is ready yet. */
  uploadFrame(): boolean {
    const { gl, video } = this;
    if (video.readyState < 2 || video.videoWidth === 0) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      return false;
    }
    return true;
  }

  render(yaw: number, pitch: number, fov: number): void {
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uRes, canvas.width, canvas.height);
    gl.uniform1f(this.uYaw, yaw);
    gl.uniform1f(this.uPitch, pitch);
    gl.uniform1f(this.uFov, fov);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

/* ---------------------------------------------------------------------------
   requestVideoFrameCallback typing (not in every lib.dom yet).
--------------------------------------------------------------------------- */
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const MIN_FOV = 0.35; // ~20°
const MAX_FOV = 1.95; // ~112°
const DEFAULT_FOV = 1.05; // ~60°
const MAX_PITCH = 1.45; // ~83°

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const SEEK_SMALL = 5;
const SEEK_LARGE = 10;
const CONTROLS_IDLE_MS = 2800;
const DOUBLE_TAP_MS = 300;

function looksLike360(video: HTMLVideoElement, filename?: string): boolean {
  const ar = video.videoWidth / Math.max(1, video.videoHeight);
  const byShape = ar > 1.9 && ar < 2.1 && video.videoWidth >= 1024;
  const byName = /(^|[^0-9])360([^0-9]|$)|equirect|panoram|vr180|_vr\b/i.test(filename ?? "");
  return byShape || byName;
}

/** Turn `MediaError.code` into something a human can act on. */
function errorMessage(el: HTMLVideoElement | null): string {
  switch (el?.error?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return "La connexion a été interrompue pendant le chargement de la vidéo.";
    case MediaError.MEDIA_ERR_DECODE:
      return "Cette vidéo est illisible : le flux est peut-être endommagé.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Ce navigateur ne sait pas lire ce format. Téléchargez la vidéo pour la regarder.";
    default:
      return "La lecture a échoué.";
  }
}

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  filename?: string;
  autoPlay?: boolean;
  /** Bytes + seconds of the source: together they give the mean bitrate, which
   *  is what the adaptive preload gate needs to size the start-up buffer. */
  size?: number;
  durationSec?: number | null;
  /** Where "Télécharger" points when playback is impossible in this browser. */
  downloadHref?: string;
  /** Never spend bytes on a metered link (Save-Data / prefers-reduced-data). */
  saveData?: boolean;
  /** Fill the parent (parent sets the box + aspect) instead of the intrinsic 16:9. */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Forwarded so a parent can read the media element (e.g. save progress). */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata?: (el: HTMLVideoElement) => void;
  onTimeUpdate?: (el: HTMLVideoElement) => void;
  onPause?: (el: HTMLVideoElement) => void;
  onEnded?: () => void;
}

/**
 * One media surface for flat and equirectangular video: a single `<video>` backs
 * both, so toggling 360 never reloads or reseeks. Its control bar is our own in
 * both modes — the native one cannot show a buffering target, cannot be reached
 * over a WebGL canvas, and looks like a different application.
 *
 * Playback never simply starts. `useAdaptivePreload` measures the link, works out
 * how much buffer this file's bitrate demands, and holds the play() call until
 * the video can actually run to the horizon without stalling.
 *
 * The playhead is written straight to the DOM from a rAF loop rather than held in
 * React state: at four `timeupdate` events per second, reconciling the whole
 * control bar would be the most expensive thing on the page during playback.
 */
export function VideoPlayer({
  src,
  poster,
  filename,
  autoPlay,
  size,
  durationSec,
  downloadHref,
  saveData,
  fill,
  className,
  style,
  videoRef,
  onLoadedMetadata,
  onTimeUpdate,
  onPause,
  onEnded,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);

  // Nodes the rAF loop writes to directly — never through React.
  const playedRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const [mode, setMode] = useState<"flat" | "360">("flat");
  const [is360Capable, setIs360Capable] = useState(false);
  const [ready360, setReady360] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [seekFlash, setSeekFlash] = useState<{ delta: number; nonce: number } | null>(null);
  // Read after mount: `document.pictureInPictureEnabled` is absent on the server
  // and a render-time check would hydrate one tree and paint another.
  const [pipSupported, setPipSupported] = useState(false);

  const preloadGate = useAdaptivePreload(internalVideoRef, { size, durationSec, autoPlay, saveData });
  const { phase, requestPlay, playNow, handlers, preload, progress, slowLink } = preloadGate;

  // Hot-path view state kept in refs so the render loop reads it without re-runs.
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const fovRef = useRef(DEFAULT_FOV);
  const draggingRef = useRef(false);
  const userToggledRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistRef = useRef(0);
  const drawRef = useRef<(() => void) | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const dragMovedRef = useRef(false);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      internalVideoRef.current = node;
      if (videoRef) videoRef.current = node;
    },
    [videoRef],
  );

  const draw = useCallback(() => {
    drawRef.current?.();
  }, []);

  /* ---- Playhead: DOM writes on a rAF loop, no React re-render ------------ */
  const paintProgress = useCallback(() => {
    const el = internalVideoRef.current;
    if (!el) return;
    const d = el.duration;
    if (!Number.isFinite(d) || d <= 0) return;

    const pct = (el.currentTime / d) * 100;
    if (playedRef.current) playedRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (timeRef.current) {
      timeRef.current.textContent = `${formatDuration(el.currentTime)} / ${formatDuration(d)}`;
    }
    if (bufferRef.current && el.buffered.length) {
      const end = el.buffered.end(el.buffered.length - 1);
      bufferRef.current.style.width = `${(end / d) * 100}%`;
    }
    // The slider's value is part of its contract with assistive tech, and it
    // never re-renders — so it gets written here with everything else.
    if (sliderRef.current) {
      sliderRef.current.setAttribute("aria-valuenow", String(Math.round(el.currentTime)));
      sliderRef.current.setAttribute(
        "aria-valuetext",
        `${formatDuration(el.currentTime)} sur ${formatDuration(d)}`,
      );
    }
  }, []);

  useEffect(() => {
    // Paused: paint once so the bar lands on the exact frame. Playing: rAF.
    if (!playing) {
      paintProgress();
      return;
    }
    let raf = 0;
    const tick = () => {
      paintProgress();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paintProgress]);

  // Duration arrives after the first paint; refresh the label and the slider bounds.
  useEffect(() => paintProgress(), [duration, paintProgress]);

  /* ---- 360 WebGL lifecycle (only while mode === "360") ------------------- */
  useEffect(() => {
    if (mode !== "360") return;
    const canvas = canvasRef.current;
    const video = internalVideoRef.current as RVFCVideo | null;
    if (!canvas || !video) return;

    let renderer: Sphere360;
    try {
      renderer = new Sphere360(canvas, video);
    } catch {
      // No WebGL — fall back to the flat player.
      userToggledRef.current = true;
      setMode("flat");
      return;
    }

    let firstFrame = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const paint = () => {
      const uploaded = renderer.uploadFrame();
      renderer.render(yawRef.current, pitchRef.current, fovRef.current);
      if (uploaded && !firstFrame) {
        firstFrame = true;
        setReady360(true);
      }
    };
    drawRef.current = paint;

    const ro = new ResizeObserver(() => {
      renderer.resize(canvas.clientWidth, canvas.clientHeight, dpr);
      paint();
    });
    ro.observe(canvas);
    renderer.resize(canvas.clientWidth, canvas.clientHeight, dpr);

    // Frame-driven upload: render exactly when the video produces a new frame
    // (idle GPU when paused). Falls back to rAF where rVFC is unavailable.
    let rvfcHandle = 0;
    let rafHandle = 0;
    const supportsRVFC = typeof video.requestVideoFrameCallback === "function";
    if (supportsRVFC) {
      const onFrame = () => {
        paint();
        rvfcHandle = video.requestVideoFrameCallback!(onFrame);
      };
      rvfcHandle = video.requestVideoFrameCallback!(onFrame);
    } else {
      const loop = () => {
        if (!video.paused) paint();
        rafHandle = requestAnimationFrame(loop);
      };
      rafHandle = requestAnimationFrame(loop);
    }
    paint();

    return () => {
      ro.disconnect();
      if (supportsRVFC && rvfcHandle) video.cancelVideoFrameCallback?.(rvfcHandle);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      drawRef.current = null;
      renderer.dispose();
      setReady360(false);
    };
  }, [mode]);

  /* ---- Auto-rotate loop -------------------------------------------------- */
  useEffect(() => {
    if (mode !== "360" || !autoRotate) return;
    let raf = 0;
    const tick = () => {
      if (!draggingRef.current) {
        yawRef.current += 0.0016;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, autoRotate, draw]);

  /* ---- First-time drag hint --------------------------------------------- */
  useEffect(() => {
    if (mode === "360" && ready360) {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 3500);
      return () => clearTimeout(t);
    }
  }, [mode, ready360]);

  /* ---- Fullscreen / PiP sync --------------------------------------------- */
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    setPipSupported(document.pictureInPictureEnabled === true);
    const el = internalVideoRef.current;
    if (!el) return;
    // React has no synthetic event for these two.
    const enter = () => setPip(true);
    const leave = () => setPip(false);
    el.addEventListener("enterpictureinpicture", enter);
    el.addEventListener("leavepictureinpicture", leave);
    return () => {
      el.removeEventListener("enterpictureinpicture", enter);
      el.removeEventListener("leavepictureinpicture", leave);
    };
  }, []);

  /* ---- A new source resets everything the old one taught us -------------- */
  useEffect(() => {
    setIs360Capable(false);
    setMode("flat");
    setDuration(0);
    userToggledRef.current = false;
  }, [src]);

  /* ---- Controls auto-hide ------------------------------------------------ */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const v = internalVideoRef.current;
      if (v && !v.paused && !speedOpen) setControlsVisible(false);
    }, CONTROLS_IDLE_MS);
  }, [speedOpen]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  /* ---- Transport --------------------------------------------------------- */
  const togglePlay = useCallback(() => {
    const v = internalVideoRef.current;
    if (!v) return;
    // Playing goes through the gate, which may hold the call back until there is
    // enough buffer. Pausing is immediate — nobody waits to stop a video.
    if (v.paused) requestPlay();
    else v.pause();
    revealControls();
  }, [requestPlay, revealControls]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = internalVideoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      v.currentTime = clamp(v.currentTime + delta, 0, v.duration);
      paintProgress();
      setSeekFlash({ delta, nonce: performance.now() });
      revealControls();
    },
    [paintProgress, revealControls],
  );

  const seekTo = useCallback(
    (ratio: number) => {
      const v = internalVideoRef.current;
      if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
      v.currentTime = clamp(ratio, 0, 1) * v.duration;
      paintProgress();
    },
    [paintProgress],
  );

  useEffect(() => {
    if (!seekFlash) return;
    const t = setTimeout(() => setSeekFlash(null), 550);
    return () => clearTimeout(t);
  }, [seekFlash]);

  const toggleMute = useCallback(() => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const nudgeVolume = useCallback((delta: number) => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.volume = clamp(v.volume + delta, 0, 1);
    v.muted = v.volume === 0;
  }, []);

  const onVolumeInput = (value: number) => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
  };

  const toggle360 = () => {
    userToggledRef.current = true;
    setMode((m) => (m === "360" ? "flat" : "360"));
    revealControls();
  };

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  const togglePip = useCallback(async () => {
    const v = internalVideoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* refused (still loading, or disablePictureInPicture) */
    }
  }, []);

  const applyRate = (value: number) => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.playbackRate = value;
    setRate(value);
    setSpeedOpen(false);
  };

  const toggleLoop = () => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.loop = !v.loop;
    setLoop(v.loop);
  };

  /* ---- Media element handlers ------------------------------------------- */
  const handleLoaded = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setDuration(el.duration || 0);
    setVolume(el.volume);
    setMuted(el.muted);
    const capable = looksLike360(el, filename);
    setIs360Capable(capable);
    if (!userToggledRef.current && capable) setMode("360");

    // The parent may seek to a saved position here; the gate must measure the
    // buffer around the NEW playhead, so let it run second.
    onLoadedMetadata?.(el);
    preloadGate.handlers.onLoadedMetadata();
  };

  /* ---- Keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const v = internalVideoRef.current;
      if (!v) return;

      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
        revealControls();
      };

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          handled();
          togglePlay();
          break;
        case "ArrowLeft":
          handled();
          seekBy(-SEEK_SMALL);
          break;
        case "ArrowRight":
          handled();
          seekBy(SEEK_SMALL);
          break;
        case "j":
        case "J":
          handled();
          seekBy(-SEEK_LARGE);
          break;
        case "l":
        case "L":
          handled();
          seekBy(SEEK_LARGE);
          break;
        case "ArrowUp":
          handled();
          nudgeVolume(0.1);
          break;
        case "ArrowDown":
          handled();
          nudgeVolume(-0.1);
          break;
        case "m":
        case "M":
          handled();
          toggleMute();
          break;
        case "f":
        case "F":
          handled();
          toggleFullscreen();
          break;
        case "p":
        case "P":
          handled();
          void togglePip();
          break;
        case "Home":
          handled();
          seekTo(0);
          break;
        case "End":
          handled();
          seekTo(1);
          break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            handled();
            seekTo(Number(e.key) / 10);
          }
      }
    };

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, seekTo, nudgeVolume, toggleMute, toggleFullscreen, togglePip, revealControls]);

  /* ---- Tap / click on the media surface ---------------------------------- */

  /**
   * Touch: one tap reveals the controls, a double tap seeks (sides) or toggles
   * play (middle) — the gesture every mobile player has trained people to expect.
   * Mouse: click toggles play, double-click goes fullscreen. The single-click
   * action is deferred by one double-click window so a double never plays and
   * pauses on its way to fullscreen.
   */
  const onSurfacePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return; // that was a 360 drag, not a tap
      }

      const now = performance.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const isDouble = now - lastTapRef.current < DOUBLE_TAP_MS;
      lastTapRef.current = isDouble ? 0 : now;

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      if (e.pointerType === "mouse") {
        if (isDouble) toggleFullscreen();
        else clickTimerRef.current = setTimeout(togglePlay, DOUBLE_TAP_MS);
        return;
      }

      if (isDouble) {
        if (x < 0.35) seekBy(-SEEK_LARGE);
        else if (x > 0.65) seekBy(SEEK_LARGE);
        else togglePlay();
      } else {
        revealControls();
      }
    },
    [togglePlay, toggleFullscreen, seekBy, revealControls],
  );

  /* ---- Pointer / wheel look controls (360) ------------------------------ */
  /** Pixels of movement past which a press is a camera drag, not a tap. */
  const DRAG_SLOP = 6;

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggingRef.current = true;
    dragMovedRef.current = false;
    setShowHint(false);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pts = pointersRef.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > DRAG_SLOP) dragMovedRef.current = true;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2) {
      // Pinch-to-zoom.
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistRef.current > 0) {
        fovRef.current = clamp(fovRef.current * (pinchDistRef.current / dist), MIN_FOV, MAX_FOV);
      }
      pinchDistRef.current = dist;
      dragMovedRef.current = true;
      draw();
      return;
    }

    // Drag-to-look (grab the panorama; it follows the pointer).
    const h = e.currentTarget.clientHeight || 1;
    const f = fovRef.current / h;
    yawRef.current += (e.clientX - prev.x) * f;
    pitchRef.current = clamp(pitchRef.current + (e.clientY - prev.y) * f, -MAX_PITCH, MAX_PITCH);
    draw();
  };
  const endPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchDistRef.current = 0;
    if (pointersRef.current.size === 0) draggingRef.current = false;
    // A press that never moved the camera was a tap on the video, not a drag.
    if (e.type === "pointerup") onSurfacePointerUp(e);
    else dragMovedRef.current = false;
  };
  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    fovRef.current = clamp(fovRef.current * Math.exp(e.deltaY * 0.0015), MIN_FOV, MAX_FOV);
    draw();
  };

  const busy = phase === "buffering" || phase === "rebuffering" || (mode === "360" && !ready360 && phase !== "error");
  const showBigPlay = phase === "idle" && !playing;
  const canPip = pipSupported && mode === "flat";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Lecteur vidéo"
      className={cn(
        "group/player relative w-full overflow-hidden rounded-2xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-accent",
        fill ? "h-full" : "aspect-video",
        !controlsVisible && playing && "cursor-none",
        className,
      )}
      style={style}
      onPointerMove={revealControls}
      onMouseLeave={() => {
        const v = internalVideoRef.current;
        if (v && !v.paused && !speedOpen) setControlsVisible(false);
      }}
    >
      {/* The single media element backs both modes. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={setVideoNode}
        src={src}
        poster={poster}
        playsInline
        preload={preload}
        controls={false}
        onLoadedMetadata={handleLoaded}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget)}
        onProgress={handlers.onProgress}
        onPlay={() => {
          setPlaying(true);
          revealControls();
        }}
        onPlaying={handlers.onPlaying}
        onWaiting={handlers.onWaiting}
        onPause={(e) => {
          setPlaying(false);
          setControlsVisible(true);
          handlers.onPause();
          onPause?.(e.currentTarget);
        }}
        onEnded={() => {
          handlers.onEnded();
          onEnded?.();
        }}
        onError={handlers.onError}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onPointerUp={mode === "flat" ? onSurfacePointerUp : undefined}
        className={cn(
          "absolute inset-0 h-full w-full bg-black object-contain",
          mode === "360" && "pointer-events-none opacity-0",
        )}
      />

      {mode === "360" && (
        <>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={onWheel}
            className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
          />

          {showHint && ready360 && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Move size={14} aria-hidden /> Glissez pour explorer la scène
            </div>
          )}
        </>
      )}

      {/* Seek feedback — for the double-tap and for the keyboard alike. */}
      {seekFlash && (
        <div
          key={seekFlash.nonce}
          className={cn(
            "pointer-events-none absolute inset-y-0 z-30 flex w-1/3 items-center justify-center",
            seekFlash.delta < 0 ? "left-0" : "right-0",
          )}
        >
          <span className="flex flex-col items-center gap-1 rounded-full bg-black/60 px-4 py-3 text-white backdrop-blur">
            {seekFlash.delta < 0 ? <Rewind size={22} aria-hidden /> : <FastForward size={22} aria-hidden />}
            <span className="tabular text-xs font-semibold">
              {seekFlash.delta < 0 ? "−" : "+"}
              {Math.abs(seekFlash.delta)} s
            </span>
          </span>
        </div>
      )}

      {phase === "error" ? (
        <ErrorOverlay message={errorMessage(internalVideoRef.current)} downloadHref={downloadHref} filename={filename} />
      ) : busy ? (
        <BufferingOverlay phase={phase} progress={progress} slowLink={slowLink} onPlayNow={playNow} />
      ) : showBigPlay ? (
        <button
          onClick={togglePlay}
          aria-label="Lire la vidéo"
          className="absolute inset-0 z-30 grid place-items-center bg-black/20 transition-colors hover:bg-black/30"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition-transform hover:scale-105">
            <Play size={28} className="translate-x-0.5 fill-current" aria-hidden />
          </span>
        </button>
      ) : null}

      {/* 360 toggle badge — only where a 360 view actually exists */}
      {(is360Capable || mode === "360") && (
        <button
          onClick={toggle360}
          title={mode === "360" ? "Vue plate" : "Vue 360°"}
          className={cn(
            "absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-all",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
            mode === "360" ? "bg-bone text-(--accent-contrast)" : "bg-black/55 text-white hover:bg-black/70",
          )}
        >
          <Orbit size={14} aria-hidden /> {mode === "360" ? "360°" : "Plate"}
        </button>
      )}

      {/* One control bar, both modes. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200 sm:px-4",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Scrubber
          duration={duration}
          sliderRef={sliderRef}
          playedRef={playedRef}
          bufferRef={bufferRef}
          thumbRef={thumbRef}
          onSeek={seekTo}
          focusable={controlsVisible}
        />

        <div className="mt-1.5 flex items-center gap-1.5 text-white sm:gap-2">
          <CtrlButton label={playing ? "Pause (k)" : "Lecture (k)"} onClick={togglePlay}>
            {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
          </CtrlButton>

          <div className="group/vol flex items-center gap-1.5">
            <CtrlButton label={muted ? "Activer le son (m)" : "Couper le son (m)"} onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolumeInput(Number(e.target.value))}
              aria-label="Volume"
              className="hidden h-1 w-0 cursor-pointer accent-bone transition-[width] group-hover/vol:w-16 group-focus-within/vol:w-16 sm:block"
            />
          </div>

          <span ref={timeRef} className="tabular ml-1 select-none text-xs text-white/85">
            {formatDuration(0)} / {formatDuration(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {mode === "360" && (
              <>
                <CtrlButton label="Dézoomer" onClick={() => zoomBy(fovRef, 1.15, draw)}>
                  <ZoomOut size={17} />
                </CtrlButton>
                <CtrlButton label="Zoomer" onClick={() => zoomBy(fovRef, 0.87, draw)}>
                  <ZoomIn size={17} />
                </CtrlButton>
                <CtrlButton
                  label="Recentrer la vue"
                  onClick={() => {
                    yawRef.current = 0;
                    pitchRef.current = 0;
                    fovRef.current = DEFAULT_FOV;
                    draw();
                  }}
                >
                  <Crosshair size={17} />
                </CtrlButton>
                <CtrlButton label="Rotation automatique" active={autoRotate} onClick={() => setAutoRotate((a) => !a)}>
                  <RotateCw size={17} />
                </CtrlButton>
              </>
            )}

            <div className="relative">
              <CtrlButton label="Vitesse de lecture" active={rate !== 1} onClick={() => setSpeedOpen((o) => !o)}>
                <Gauge size={17} />
              </CtrlButton>
              {speedOpen && (
                // Rendered inside the container, not a portal: a portalled menu
                // lands outside the fullscreen element and becomes invisible.
                <div
                  className="absolute bottom-11 right-0 z-40 min-w-28 overflow-hidden rounded-xl bg-black/85 py-1 text-sm text-white shadow-xl backdrop-blur"
                  role="menu"
                >
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={rate === s}
                      onClick={() => applyRate(s)}
                      className={cn(
                        "block w-full px-3 py-1.5 text-left transition-colors hover:bg-white/15",
                        rate === s && "font-semibold text-bone",
                      )}
                    >
                      {s === 1 ? "Normale" : `${s}×`.replace(".", ",")}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <CtrlButton label="Lire en boucle" active={loop} onClick={toggleLoop}>
              <Repeat size={17} />
            </CtrlButton>

            {canPip && (
              <CtrlButton label="Image dans l'image (p)" active={pip} onClick={() => void togglePip()}>
                <PictureInPicture2 size={17} />
              </CtrlButton>
            )}

            <CtrlButton label={fullscreen ? "Quitter le plein écran (f)" : "Plein écran (f)"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </CtrlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function zoomBy(fovRef: React.RefObject<number>, factor: number, draw: () => void): void {
  fovRef.current = clamp(fovRef.current * factor, MIN_FOV, MAX_FOV);
  draw();
}

/* ---------------------------------------------------------------------------
   Overlays
--------------------------------------------------------------------------- */

/**
 * What the viewer sees while we hold playback back. The ring is the honest
 * answer to "how much longer?", and "Lire maintenant" is the escape hatch for
 * anyone who would rather risk a stutter than wait.
 */
function BufferingOverlay({
  phase,
  progress,
  slowLink,
  onPlayNow,
}: {
  phase: PlaybackPhase;
  progress: number;
  slowLink: boolean;
  onPlayNow: () => void;
}) {
  // Only offer the override once the wait is long enough to be annoying.
  const [showOverride, setShowOverride] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowOverride(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const pct = Math.round(clamp(progress, 0, 1) * 100);
  const gating = phase === "buffering" || phase === "rebuffering";

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        {gating ? (
          <Ring pct={pct} />
        ) : (
          <Loader2 size={34} className="animate-spin text-bone" aria-hidden />
        )}

        {gating && (
          <>
            <p className="text-sm font-medium text-white" aria-live="polite">
              {phase === "rebuffering" ? "Rechargement du tampon" : "Mise en mémoire tampon"}
              {pct > 0 ? ` — ${pct} %` : "…"}
            </p>
            {slowLink && (
              <p className="max-w-xs text-xs leading-relaxed text-white/70">
                Connexion lente détectée. On précharge un peu d&apos;avance pour éviter les coupures.
              </p>
            )}
            {showOverride && (
              <button
                onClick={onPlayNow}
                className="mt-1 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/25"
              >
                Lire maintenant
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A 44px progress ring drawn with a single stroked circle. */
function Ring({ pct }: { pct: number }) {
  const R = 20;
  const C = 2 * Math.PI * R;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" aria-hidden className="-rotate-90">
      <circle cx={24} cy={24} r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
      <circle
        cx={24}
        cy={24}
        r={R}
        fill="none"
        stroke="var(--bone)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct / 100)}
        style={{ transition: "stroke-dashoffset 200ms linear" }}
      />
    </svg>
  );
}

/**
 * A codec this browser cannot decode is a routine event on a self-hosted drive
 * (HEVC in an MP4, Matroska in Safari). Say so, and offer the file.
 */
function ErrorOverlay({
  message,
  downloadHref,
  filename,
}: {
  message: string;
  downloadHref?: string;
  filename?: string;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <TriangleAlert size={30} className="text-warning" aria-hidden />
        <p className="text-sm font-medium text-white">Lecture impossible</p>
        <p className="text-xs leading-relaxed text-white/70">{message}</p>
        {downloadHref && (
          <a
            href={downloadHref}
            download={filename}
            className="mt-1 inline-flex items-center gap-2 rounded-full bg-bone px-4 py-1.5 text-xs font-semibold text-(--accent-contrast) transition-transform hover:scale-105"
          >
            <Download size={14} aria-hidden /> Télécharger la vidéo
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Control bar pieces
--------------------------------------------------------------------------- */

function CtrlButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-bone",
        active ? "bg-bone text-(--accent-contrast)" : "text-white hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The fill, the buffer band and the knob are all written by the player's rAF
 * loop through these refs — the component itself only re-renders when the
 * duration changes. `role="slider"` needs a real keyboard contract, so it has one.
 */
function Scrubber({
  duration,
  sliderRef,
  playedRef,
  bufferRef,
  thumbRef,
  onSeek,
  focusable,
}: {
  duration: number;
  sliderRef: React.RefObject<HTMLDivElement | null>;
  playedRef: React.RefObject<HTMLDivElement | null>;
  bufferRef: React.RefObject<HTMLDivElement | null>;
  thumbRef: React.RefObject<HTMLDivElement | null>;
  onSeek: (ratio: number) => void;
  focusable: boolean;
}) {
  const scrubbingRef = useRef(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  const ratioAt = (clientX: number): number => {
    const el = sliderRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = playedRef.current;
    if (!el || duration <= 0) return;
    const current = (Number.parseFloat(el.style.width) / 100) * duration || 0;
    const step = (delta: number) => {
      e.preventDefault();
      e.stopPropagation(); // the container's shortcuts would seek twice
      onSeek(clamp(current + delta, 0, duration) / duration);
    };
    switch (e.key) {
      case "ArrowLeft":
        step(-SEEK_SMALL);
        break;
      case "ArrowRight":
        step(SEEK_SMALL);
        break;
      case "PageDown":
        step(-duration * 0.1);
        break;
      case "PageUp":
        step(duration * 0.1);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        onSeek(0);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        onSeek(1);
        break;
    }
  };

  return (
    <div
      ref={sliderRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubbingRef.current = true;
        onSeek(ratioAt(e.clientX));
      }}
      onPointerMove={(e) => {
        const r = ratioAt(e.clientX);
        setHover({ x: r, t: r * duration });
        if (scrubbingRef.current) onSeek(r);
      }}
      onPointerUp={(e) => {
        scrubbingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      // A generous invisible hit area over a thin visible bar: the standard trick
      // for a target a thumb can actually land on.
      className="group/scrub relative -mx-1 h-5 cursor-pointer touch-none px-1"
      role="slider"
      aria-label="Progression"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      // `aria-valuenow` / `aria-valuetext` are written by the player's paint loop
      // (see paintProgress) — this component does not re-render while playing.
      aria-valuenow={0}
      tabIndex={focusable ? 0 : -1}
    >
      <div className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/scrub:h-1.5">
        <div ref={bufferRef} className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: "0%" }} />
        <div ref={playedRef} className="absolute inset-y-0 left-0 rounded-full bg-bone" style={{ width: "0%" }} />
      </div>
      <div
        ref={thumbRef}
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone opacity-0 shadow transition-opacity group-hover/scrub:opacity-100"
        style={{ left: "0%" }}
      />

      {hover && duration > 0 && (
        <span
          className="tabular pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 text-[0.7rem] font-medium text-white"
          style={{ left: `${hover.x * 100}%` }}
        >
          {formatDuration(hover.t)}
        </span>
      )}
    </div>
  );
}
