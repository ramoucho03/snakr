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
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function looksLike360(video: HTMLVideoElement, filename?: string): boolean {
  const ar = video.videoWidth / Math.max(1, video.videoHeight);
  const byShape = ar > 1.9 && ar < 2.1 && video.videoWidth >= 1024;
  const byName = /(^|[^0-9])360([^0-9]|$)|equirect|panoram|vr180|_vr\b/i.test(filename ?? "");
  return byShape || byName;
}

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  filename?: string;
  autoPlay?: boolean;
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
 * A single media surface that plays flat videos with native controls and, for
 * equirectangular sources, a hardware-accelerated 360° viewer with drag-to-look,
 * pinch/wheel zoom, auto-rotate and a bespoke glass control bar. The SAME <video>
 * element backs both modes, so toggling never reloads or reseeks playback.
 */
export function VideoPlayer({
  src,
  poster,
  filename,
  autoPlay,
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

  const [mode, setMode] = useState<"flat" | "360">("flat");
  const [ready360, setReady360] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showHint, setShowHint] = useState(false);

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

  /* ---- Fullscreen sync --------------------------------------------------- */
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---- Controls auto-hide ------------------------------------------------ */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const v = internalVideoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, 2800);
  }, []);

  /* ---- Media element handlers ------------------------------------------- */
  const handleLoaded = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setDuration(el.duration || 0);
    setVolume(el.volume);
    setMuted(el.muted);
    if (!userToggledRef.current && looksLike360(el, filename)) setMode("360");
    onLoadedMetadata?.(el);
  };
  const handleTime = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setCurrent(el.currentTime);
    if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
    onTimeUpdate?.(el);
  };

  const togglePlay = useCallback(() => {
    const v = internalVideoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = () => {
    const v = internalVideoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

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

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  const resetView = () => {
    yawRef.current = 0;
    pitchRef.current = 0;
    fovRef.current = DEFAULT_FOV;
    draw();
  };

  const zoom = (factor: number) => {
    fovRef.current = clamp(fovRef.current * factor, MIN_FOV, MAX_FOV);
    draw();
  };

  /* ---- Pointer / wheel look controls (360) ------------------------------ */
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggingRef.current = true;
    setShowHint(false);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pts = pointersRef.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2) {
      // Pinch-to-zoom.
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistRef.current > 0) {
        fovRef.current = clamp(fovRef.current * (pinchDistRef.current / dist), MIN_FOV, MAX_FOV);
      }
      pinchDistRef.current = dist;
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
  };
  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    fovRef.current = clamp(fovRef.current * Math.exp(e.deltaY * 0.0015), MIN_FOV, MAX_FOV);
    draw();
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/player relative w-full overflow-hidden rounded-2xl bg-black",
        fill ? "h-full" : "aspect-video",
        className,
      )}
      style={style}
      onPointerMove={revealControls}
      onMouseLeave={() => {
        const v = internalVideoRef.current;
        if (v && !v.paused) setControlsVisible(false);
      }}
    >
      {/* The single media element backs both modes. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={setVideoNode}
        src={src}
        poster={poster}
        playsInline
        autoPlay={autoPlay}
        controls={mode === "flat"}
        onLoadedMetadata={handleLoaded}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={handleTime}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onPlay={() => {
          setPlaying(true);
          revealControls();
        }}
        onPause={(e) => {
          setPlaying(false);
          setControlsVisible(true);
          onPause?.(e.currentTarget);
        }}
        onEnded={() => onEnded?.()}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
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
            onDoubleClick={togglePlay}
            className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
          />

          {!ready360 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black">
              <Loader2 size={30} className="animate-spin text-bone" aria-hidden />
            </div>
          )}

          {showHint && ready360 && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Move size={14} aria-hidden /> Glissez pour explorer la scène
            </div>
          )}
        </>
      )}

      {/* 360 toggle badge (both modes) */}
      <button
        onClick={toggle360}
        title={mode === "360" ? "Vue plate" : "Vue 360°"}
        className={cn(
          "absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-all",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
          mode === "360"
            ? "bg-bone text-(--accent-contrast)"
            : "bg-black/55 text-white hover:bg-black/70",
        )}
      >
        <Orbit size={14} aria-hidden /> {mode === "360" ? "360°" : "360°"}
      </button>

      {/* Bespoke control bar (360 mode) */}
      {mode === "360" && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200 sm:px-4",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {/* Scrubber */}
          <Scrubber
            pct={pct}
            bufPct={bufPct}
            onSeek={(ratio) => {
              const v = internalVideoRef.current;
              if (v && duration > 0) v.currentTime = ratio * duration;
            }}
          />

          <div className="mt-1.5 flex items-center gap-1.5 text-white sm:gap-2">
            <CtrlButton label={playing ? "Pause" : "Lecture"} onClick={togglePlay}>
              {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
            </CtrlButton>

            <div className="flex items-center gap-1.5">
              <CtrlButton label={muted ? "Activer le son" : "Couper le son"} onClick={toggleMute}>
                {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </CtrlButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeInput(Number(e.target.value))}
                aria-label="Volume"
                className="hidden h-1 w-16 cursor-pointer accent-bone sm:block"
              />
            </div>

            <span className="tabular ml-1 select-none text-xs text-white/85">
              {formatDuration(current)} / {formatDuration(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
              <CtrlButton label="Dézoomer" onClick={() => zoom(1.15)}>
                <ZoomOut size={17} />
              </CtrlButton>
              <CtrlButton label="Zoomer" onClick={() => zoom(0.87)}>
                <ZoomIn size={17} />
              </CtrlButton>
              <CtrlButton label="Recentrer la vue" onClick={resetView}>
                <Crosshair size={17} />
              </CtrlButton>
              <CtrlButton
                label="Rotation automatique"
                active={autoRotate}
                onClick={() => setAutoRotate((a) => !a)}
              >
                <RotateCw size={17} />
              </CtrlButton>
              <CtrlButton label={fullscreen ? "Quitter le plein écran" : "Plein écran"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </CtrlButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
        "grid h-9 w-9 place-items-center rounded-full transition-colors",
        active ? "bg-bone text-(--accent-contrast)" : "text-white hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

function Scrubber({
  pct,
  bufPct,
  onSeek,
}: {
  pct: number;
  bufPct: number;
  onSeek: (ratio: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);

  const seekAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onSeek(clamp((clientX - rect.left) / rect.width, 0, 1));
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubbingRef.current = true;
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => {
        if (scrubbingRef.current) seekAt(e.clientX);
      }}
      onPointerUp={(e) => {
        scrubbingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="group/scrub relative h-3 cursor-pointer touch-none"
      role="slider"
      aria-label="Progression"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-bone" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone opacity-0 shadow transition-opacity group-hover/scrub:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
