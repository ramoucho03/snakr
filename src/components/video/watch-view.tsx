"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Download,
  Star,
  Maximize,
  RectangleHorizontal,
  FolderOpen,
  ListVideo,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatBytes, formatDate, initials } from "@/lib/utils";
import { starAction } from "@/app/drive/actions";
import type { VideoItem } from "./types";
import { VideoCard } from "./video-card";
import { saveProgress, getProgress, clearProgress } from "./progress";

const AUTOPLAY_KEY = "snakr:autoplay";
const THEATER_KEY = "snakr:theater";

export function WatchView({
  video,
  related,
}: {
  video: VideoItem;
  related: VideoItem[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const lastSavedRef = useRef(-1);

  const [theater, setTheater] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [starred, setStarred] = useState(video.starred);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const next = related[0] ?? null;

  // Restore persisted preferences (client-only to avoid a hydration mismatch).
  useEffect(() => {
    try {
      setAutoplay(localStorage.getItem(AUTOPLAY_KEY) !== "0");
      setTheater(localStorage.getItem(THEATER_KEY) === "1");
    } catch {
      /* private mode / disabled storage — keep defaults */
    }
  }, []);

  // Persist the final position when leaving the page / switching video.
  useEffect(() => {
    const el = videoRef.current;
    const id = video.id;
    return () => {
      if (el && el.duration > 0) saveProgress(id, el.currentTime, el.duration);
    };
  }, [video.id]);

  const persist = (key: string, on: boolean) => {
    try {
      localStorage.setItem(key, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const toggleTheater = useCallback(() => {
    setTheater((t) => {
      persist(THEATER_KEY, !t);
      return !t;
    });
  }, []);

  const toggleAutoplay = () => {
    setAutoplay((a) => {
      persist(AUTOPLAY_KEY, !a);
      return !a;
    });
  };

  const goFullscreen = useCallback(() => {
    const el = playerBoxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setResolution({ w: el.videoWidth, h: el.videoHeight });
    // Resume where the viewer left off (unless basically at the start/end).
    const saved = getProgress(video.id);
    if (saved && saved.t > 5 && el.duration > 0 && saved.t < el.duration * 0.95) {
      try {
        el.currentTime = saved.t;
      } catch {
        /* seeking not ready — ignore */
      }
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    const sec = Math.floor(el.currentTime);
    // Throttle to once every 5s of playback.
    if (sec !== lastSavedRef.current && sec % 5 === 0) {
      lastSavedRef.current = sec;
      saveProgress(video.id, el.currentTime, el.duration);
    }
  };

  const handlePause = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    saveProgress(video.id, el.currentTime, el.duration);
  };

  const handleEnded = () => {
    clearProgress(video.id);
    if (autoplay && next) router.push(`/videos/${next.id}`);
  };

  function toggleFavorite() {
    const optimistic = !starred;
    setStarred(optimistic);
    startTransition(async () => {
      const res = await starAction({ fileId: video.id });
      if (!res.ok) {
        setStarred(!optimistic);
        toast.error(res.error);
      } else {
        setStarred(res.starred);
        router.refresh();
      }
    });
  }

  // Keyboard shortcuts: (t)heater, (f)ullscreen — YouTube parity.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        toggleTheater();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        goFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheater, goFullscreen]);

  const player = (
    <div
      ref={playerBoxRef}
      className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-(--shadow-float) ring-1 ring-glass-border"
      style={theater ? { maxWidth: "calc((100vh - 172px) * 16 / 9)" } : undefined}
    >
      <video
        ref={videoRef}
        src={`/api/files/${video.id}`}
        poster={video.hasThumb ? `/api/files/${video.id}/thumb` : undefined}
        controls
        autoPlay
        playsInline
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPause={handlePause}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-6", !theater && "xl:flex-row")}>
      {/* Main column */}
      <div className={cn("flex min-w-0 flex-col gap-4", !theater && "xl:flex-1")}>
        {player}

        <h1 className="font-display text-lg font-semibold leading-tight text-text-hi sm:text-xl">
          {video.name}
        </h1>

        {/* Owner + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-glass-strong text-sm font-semibold text-text-hi"
              aria-hidden
            >
              {initials(video.ownerName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-hi">{video.ownerName}</p>
              <p className="text-xs text-text-faint">
                {video.owned ? "Vous" : "Partagé avec vous"}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {video.owned && (
              <button
                onClick={toggleFavorite}
                disabled={pending}
                aria-pressed={starred}
                className={buttonClass({
                  variant: starred ? "primary" : "secondary",
                  size: "sm",
                })}
              >
                <Star size={15} className={cn(starred && "fill-current")} aria-hidden />
                <span className="hidden sm:inline">{starred ? "Favori" : "Ajouter"}</span>
              </button>
            )}
            <a
              href={`/api/files/${video.id}?dl=1`}
              download
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <Download size={15} aria-hidden />
              <span className="hidden sm:inline">Télécharger</span>
            </a>
            <button
              onClick={toggleTheater}
              aria-pressed={theater}
              title="Mode cinéma (t)"
              className={cn(
                buttonClass({ variant: "secondary", size: "sm" }),
                "hidden xl:inline-flex",
                theater && "text-accent",
              )}
            >
              <RectangleHorizontal size={15} aria-hidden />
            </button>
            <button
              onClick={goFullscreen}
              title="Plein écran (f)"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <Maximize size={15} aria-hidden />
            </button>
          </div>
        </div>

        {/* Metadata card */}
        <dl className="glass grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl p-4 text-sm sm:grid-cols-4">
          <Meta term="Ajoutée le" value={formatDate(video.createdAt)} />
          <Meta term="Taille" value={formatBytes(video.size)} />
          <Meta
            term="Résolution"
            value={resolution ? `${resolution.w} × ${resolution.h}` : "—"}
          />
          <Meta term="Format" value={video.mime.split("/")[1]?.toUpperCase() ?? video.mime} />
        </dl>

        <Link
          href="/drive"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
        >
          <FolderOpen size={15} aria-hidden /> Ouvrir dans le drive
        </Link>
      </div>

      {/* Sidebar — up next */}
      <aside className={cn("w-full shrink-0", !theater && "xl:w-96")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-hi">
            <ListVideo size={16} className="text-accent" aria-hidden /> À suivre
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-text-lo">
            Lecture auto
            <button
              type="button"
              role="switch"
              aria-checked={autoplay}
              onClick={toggleAutoplay}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                autoplay ? "bg-accent" : "bg-glass-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                  autoplay ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
          </label>
        </div>

        {related.length === 0 ? (
          <p className="rounded-xl border border-dashed border-glass-border px-4 py-8 text-center text-sm text-text-faint">
            Aucune autre vidéo à afficher.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {related.map((v) => (
              <VideoCard key={v.id} video={v} variant="row" />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function Meta({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-faint">{term}</dt>
      <dd className="tabular truncate font-medium text-text-hi">{value}</dd>
    </div>
  );
}
