"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Star, RectangleHorizontal, FolderOpen, ListVideo, RotateCcw, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { starAction } from "@/app/drive/actions";
import { videoDownloadSrc, videoPosterSrc, videoSrc, type VideoItem, type VideoVisibility } from "./types";
import type { ChannelBadge } from "@/lib/channel";
import type { CommentDTO } from "@/lib/comments";
import { VideoCard } from "./video-card";
import { VideoPlayer } from "./video-player";
import { SubscribeButton } from "./subscribe-button";
import { ReactionBar, type ReactionState } from "./reaction-bar";
import { ShareButton } from "./share-button";
import { VisibilityMenu } from "./visibility-menu";
import { DescriptionPanel } from "./description-panel";
import { Comments } from "./comments";
import { useSaveData } from "./use-video";
import { saveProgress, getProgress, clearProgress } from "./progress";

const AUTOPLAY_KEY = "snakr:autoplay";
const THEATER_KEY = "snakr:theater";
/** Seconds of grace before the next video takes over. Long enough to cancel. */
const UP_NEXT_SECONDS = 5;

export interface WatchViewer {
  id: string;
  name: string;
  hasAvatar: boolean;
}

/**
 * The full watch experience, shared by the authenticated hub (/videos/[id]) and
 * the public, no-account surface (/watch/[id]). Interactive features degrade
 * gracefully for anonymous viewers (they are routed to sign-in). `surface`
 * toggles the app-only affordances (favorite, download, drive link, theater).
 */
export function WatchView({
  video,
  related,
  channel,
  reactions,
  comments,
  viewer,
  surface,
  shareUrl,
}: {
  video: VideoItem;
  related: VideoItem[];
  channel: ChannelBadge;
  reactions: ReactionState;
  comments: CommentDTO[];
  viewer: WatchViewer | null;
  surface: "app" | "public";
  shareUrl: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(-1);
  const saveData = useSaveData();

  const isApp = surface === "app";
  const basePath = isApp ? "/videos" : "/watch";
  const watchPath = `${basePath}/${video.id}`;
  const loginHref = `/login?next=${encodeURIComponent(watchPath)}`;
  const channelHref = `/channel/${channel.handle ?? channel.id}`;

  const [theater, setTheater] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [starred, setStarred] = useState(video.starred);
  const [visibility, setVisibility] = useState<VideoVisibility>(video.visibility);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const next = related[0] ?? null;
  const canInteract = viewer != null;

  // Restore persisted preferences (client-only to avoid a hydration mismatch).
  useEffect(() => {
    try {
      setAutoplay(localStorage.getItem(AUTOPLAY_KEY) !== "0");
      setTheater(localStorage.getItem(THEATER_KEY) === "1");
    } catch {
      /* private mode / disabled storage — keep defaults */
    }
  }, []);

  // Register a view once per session, a few seconds into the visit.
  useEffect(() => {
    const key = `snakr:viewed:${video.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      fetch(`/api/videos/${video.id}/view`, { method: "POST" }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [video.id]);

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

  const handleLoadedMetadata = (el: HTMLVideoElement) => {
    const saved = getProgress(video.id);
    if (saved && saved.t > 5 && el.duration > 0 && saved.t < el.duration * 0.95) {
      try {
        el.currentTime = saved.t;
        // Silently teleporting someone into the middle of a video is disorienting.
        setResumedAt(saved.t);
      } catch {
        /* seeking not ready — ignore */
      }
    }
  };

  const restart = () => {
    const el = videoRef.current;
    if (el) el.currentTime = 0;
    clearProgress(video.id);
    setResumedAt(null);
  };

  const handleTimeUpdate = (el: HTMLVideoElement) => {
    const sec = Math.floor(el.currentTime);
    if (sec !== lastSavedRef.current && sec % 5 === 0) {
      lastSavedRef.current = sec;
      saveProgress(video.id, el.currentTime, el.duration);
    }
  };

  const handlePause = (el: HTMLVideoElement) => {
    saveProgress(video.id, el.currentTime, el.duration);
  };

  const handleEnded = () => {
    clearProgress(video.id);
    if (autoplay && next) setCountdown(UP_NEXT_SECONDS);
  };

  // The up-next countdown. Cancellable, because nobody wants to be dragged into
  // a video they did not choose.
  useEffect(() => {
    if (countdown == null || !next) return;
    if (countdown <= 0) {
      router.push(`${basePath}/${next.id}`);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, next, router, basePath]);

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

  // Keyboard shortcut: (t)heater. The player owns every other shortcut.
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheater]);

  return (
    <div className={cn("flex flex-col gap-6", !theater && "xl:flex-row")}>
      {/* Main column */}
      <div className={cn("flex min-w-0 flex-col gap-4", !theater && "xl:flex-1")}>
        {/* The wrapper carries the theater box so the up-next overlay lines up
            with the video rather than the full-width column. */}
        <div
          className="relative mx-auto w-full"
          style={theater ? { maxWidth: "calc((100vh - 172px) * 16 / 9)" } : undefined}
        >
          <VideoPlayer
            src={videoSrc(video)}
            poster={videoPosterSrc(video)}
            filename={video.name}
            size={video.size}
            durationSec={video.durationSec}
            downloadHref={videoDownloadSrc(video)}
            saveData={saveData}
            autoPlay
            videoRef={videoRef}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPause={handlePause}
            onEnded={handleEnded}
            className="shadow-(--shadow-float) ring-1 ring-glass-border"
          />

          {countdown != null && next && (
            <UpNextOverlay
              seconds={countdown}
              video={next}
              onCancel={() => setCountdown(null)}
              onPlayNow={() => router.push(`${basePath}/${next.id}`)}
            />
          )}
        </div>

        {resumedAt != null && (
          <div className="flex items-center gap-3 rounded-xl border border-glass-border bg-glass px-3 py-2 text-sm">
            <RotateCcw size={15} className="shrink-0 text-accent" aria-hidden />
            <p className="min-w-0 flex-1 text-text-lo">
              Reprise à <span className="tabular font-medium text-text-hi">{formatDuration(resumedAt)}</span>
            </p>
            <button onClick={restart} className="shrink-0 text-xs font-medium text-accent hover:underline">
              Recommencer
            </button>
            <button
              onClick={() => setResumedAt(null)}
              aria-label="Masquer"
              className="shrink-0 rounded-md p-1 text-text-faint transition-colors hover:text-text-hi"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}

        <h1 className="font-display text-lg font-semibold leading-tight text-text-hi sm:text-xl">
          {video.name}
        </h1>

        {/* Channel + action bar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              userId={channel.id}
              name={channel.name}
              hasAvatar={channel.hasAvatar}
              size={44}
              href={channelHref}
              ring
            />
            <div className="min-w-0">
              <Link
                href={channelHref}
                className="block truncate text-sm font-semibold text-text-hi transition-colors hover:text-accent"
              >
                {channel.name}
              </Link>
              <p className="tabular truncate text-xs text-text-lo">
                {formatCount(channel.subscriberCount)}{" "}
                {channel.subscriberCount <= 1 ? "abonné" : "abonnés"}
              </p>
            </div>
            {!channel.isOwner && (
              <div className="ml-1 shrink-0">
                <SubscribeButton
                  channelId={channel.id}
                  initialSubscribed={channel.subscribed}
                  canSubscribe={canInteract}
                  size="sm"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ReactionBar fileId={video.id} initial={reactions} canReact={canInteract} loginHref={loginHref} />
            {visibility !== "PRIVATE" && <ShareButton url={shareUrl} size="sm" shareTitle={video.name} />}
            {channel.isOwner && (
              <VisibilityMenu fileId={video.id} initial={visibility} onChange={setVisibility} />
            )}
            {isApp && video.owned && (
              <button
                onClick={toggleFavorite}
                disabled={pending}
                aria-pressed={starred}
                className={cn(buttonClass({ variant: starred ? "primary" : "secondary", size: "sm" }), "rounded-full")}
              >
                <Star size={15} className={cn(starred && "fill-current")} aria-hidden />
                <span className="hidden sm:inline">{starred ? "Favori" : "Ajouter"}</span>
              </button>
            )}
            {isApp && (
              <a
                href={videoDownloadSrc(video)}
                download
                className={cn(buttonClass({ variant: "secondary", size: "sm" }), "rounded-full")}
              >
                <Download size={15} aria-hidden />
                <span className="hidden sm:inline">Télécharger</span>
              </a>
            )}
            <button
              onClick={toggleTheater}
              aria-pressed={theater}
              title="Mode cinéma (t)"
              className={cn(
                buttonClass({ variant: "secondary", size: "sm" }),
                "hidden rounded-full xl:inline-flex",
                theater && "text-accent",
              )}
            >
              <RectangleHorizontal size={15} aria-hidden />
            </button>
          </div>
        </div>

        {/* Views + date + description */}
        <DescriptionPanel
          fileId={video.id}
          initialDescription={video.description}
          viewCount={video.viewCount}
          createdAt={video.createdAt}
          canEdit={isApp && video.owned}
        />

        {isApp && video.owned && (
          <Link
            href="/drive"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
          >
            <FolderOpen size={15} aria-hidden /> Ouvrir dans mon espace
          </Link>
        )}

        {/* Comments */}
        <div className="mt-2">
          <Comments
            fileId={video.id}
            initial={comments}
            viewerId={viewer?.id ?? null}
            viewerHasAvatar={viewer?.hasAvatar ?? false}
            viewerName={viewer?.name ?? ""}
            isOwner={channel.isOwner}
            loginHref={loginHref}
          />
        </div>
      </div>

      {/* Sidebar — up next */}
      <aside className={cn("w-full shrink-0", !theater && "xl:w-96")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-hi">
            <ListVideo size={16} className="text-accent" aria-hidden />
            {surface === "public" ? "Plus de cette chaîne" : "À suivre"}
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
          <p className="rounded-xl border border-dashed border-glass-border px-4 py-8 text-center text-sm text-text-lo">
            Aucune autre vidéo à afficher.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {related.map((v) => (
              <VideoCard key={v.id} video={v} variant="row" basePath={basePath} />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

/** The "next video in 5…" card, with the escape hatch a countdown owes you. */
function UpNextOverlay({
  seconds,
  video,
  onCancel,
  onPlayNow,
}: {
  seconds: number;
  video: VideoItem;
  onCancel: () => void;
  onPlayNow: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center rounded-2xl bg-black/80 px-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <p className="text-xs uppercase tracking-wide text-white/60">Vidéo suivante</p>
        <p className="line-clamp-2 text-sm font-medium text-white">{video.name}</p>
        <p className="tabular text-sm text-white/70" aria-live="polite">
          Lecture dans {seconds} s
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/25"
          >
            Annuler
          </button>
          <button
            onClick={onPlayNow}
            className="rounded-full bg-bone px-4 py-1.5 text-xs font-semibold text-(--accent-contrast) transition-transform hover:scale-105"
          >
            Lire maintenant
          </button>
        </div>
      </div>
    </div>
  );
}
