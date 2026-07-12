"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { Play, Star, CheckCircle2, Lock, Link2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelative, formatDuration, formatViews } from "@/lib/utils";
import type { VideoItem } from "./types";
import { useCanHover, useSaveData } from "./use-video";
import { getProgress, progressFraction } from "./progress";

/** Hovering past this settles a real intent to preview, not a cursor sweep. */
const HOVER_DWELL_MS = 400;

/**
 * The 16:9 preview surface: poster thumbnail, duration badge, a resume progress
 * bar, and — on hover-capable pointers — a muted autoplaying preview, exactly
 * like a YouTube thumbnail.
 *
 * Two things it deliberately does NOT do. It never probes the video for its
 * duration (that arrives with the row, measured once by ffprobe at upload), and
 * its hover preview streams a ~200 KB derived clip rather than the source file.
 * Both used to cost a network round-trip into the original video per card.
 */
function Thumb({ video, preview }: { video: VideoItem; preview: boolean }) {
  const reduce = useReducedMotion();
  const canHover = useCanHover();
  const saveData = useSaveData();

  const [hovering, setHovering] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [frac, setFrac] = useState(0);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFrac(progressFraction(getProgress(video.id)));
  }, [video.id]);

  useEffect(() => () => void (dwellRef.current && clearTimeout(dwellRef.current)), []);

  const enter = () => {
    if (dwellRef.current) clearTimeout(dwellRef.current);
    dwellRef.current = setTimeout(() => setHovering(true), HOVER_DWELL_MS);
  };
  const leave = () => {
    if (dwellRef.current) clearTimeout(dwellRef.current);
    setHovering(false);
  };

  const showThumb = video.hasThumb && !imgFailed;
  const canPreview = preview && video.hasPreview && canHover && !reduce && !saveData;
  const showPreview = canPreview && hovering;
  const privacy =
    video.owned && video.visibility !== "PUBLIC"
      ? video.visibility === "PRIVATE"
        ? { icon: Lock, label: "Privée" }
        : { icon: Link2, label: "Non répertoriée" }
      : null;

  return (
    <div
      onMouseEnter={canPreview ? enter : undefined}
      onMouseLeave={canPreview ? leave : undefined}
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-bg-1"
    >
      {showThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${video.id}/thumb`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-linear-to-br from-tan/25 via-bg-1 to-smoke/20">
          <Play size={34} className="text-text-hi/70" aria-hidden />
        </div>
      )}

      {showPreview && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={`/api/files/${video.id}/preview`}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full bg-black object-cover"
        />
      )}

      {/* Hover scrim + play affordance */}
      <div className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-opacity duration-200 group-hover:bg-black/10 group-hover:opacity-100">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
          <Play size={20} className="translate-x-px fill-current" aria-hidden />
        </span>
      </div>

      {video.starred && (
        <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/55 backdrop-blur">
          <Star size={13} className="fill-warning text-warning" aria-hidden />
        </span>
      )}

      {frac > 0 && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-medium leading-none text-white backdrop-blur">
          <CheckCircle2 size={11} className="text-tan" aria-hidden /> Repris
        </span>
      )}

      {privacy && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-medium leading-none text-white backdrop-blur">
          <privacy.icon size={11} className="text-tan" aria-hidden /> {privacy.label}
        </span>
      )}

      {video.durationSec != null && (
        <span className="tabular absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[0.7rem] font-medium leading-none text-white">
          {formatDuration(video.durationSec)}
        </span>
      )}

      {/* Resume progress bar (YouTube's red line) */}
      {frac > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0.75 bg-black/40">
          <div className="h-full rounded-r-full bg-tan" style={{ width: `${Math.min(frac * 100, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function Meta({ video }: { video: VideoItem }) {
  return (
    <>
      <p className="truncate text-xs text-text-lo">{video.ownerName}</p>
      {/* text-lo, not text-faint: the faint token drops under 4.5:1 in light mode. */}
      <p className="tabular truncate text-xs text-text-lo">
        {formatViews(video.viewCount)} · {formatRelative(video.createdAt)}
      </p>
    </>
  );
}

export function VideoCard({
  video,
  variant = "grid",
  basePath = "/videos",
}: {
  video: VideoItem;
  variant?: "grid" | "row";
  /** Link surface: "/videos" (authed hub) or "/watch" (public). */
  basePath?: string;
}) {
  const href = `${basePath}/${video.id}`;

  if (variant === "row") {
    return (
      <Link href={href} className="group flex gap-2.5 rounded-xl p-1 transition-colors hover:bg-glass">
        <div className="w-36 shrink-0 sm:w-44">
          <Thumb video={video} preview={false} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-text-hi">
            {video.name}
          </h3>
          <div className="mt-1">
            <Meta video={video} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="group flex flex-col gap-3">
      <Thumb video={video} preview />
      <div className="flex gap-3">
        <Avatar
          userId={video.ownerId}
          name={video.ownerName}
          hasAvatar={video.ownerHasAvatar}
          size={36}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text-hi">
            {video.name}
          </h3>
          <div className="mt-1">
            <Meta video={video} />
          </div>
        </div>
      </div>
    </Link>
  );
}
