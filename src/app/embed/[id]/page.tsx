import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getPublicVideoDetail } from "@/lib/videos";
import { appOrigin } from "@/lib/url";
import { VideoPlayer } from "@/components/video/video-player";
import { videoPosterSrc, videoSrc } from "@/components/video/types";

export const dynamic = "force-dynamic";

/**
 * The iframe body behind `twitter:player` and the oEmbed `html`. It is the ONE
 * route allowed to be framed cross-origin: `proxy.ts` relaxes `frame-ancestors`
 * and drops `X-Frame-Options` for `/embed/*` and nowhere else.
 *
 * Clickjacking exposure is nil by construction — this page has no session, no
 * action, and no button an attacker could trick a victim into clicking. It only
 * ever renders a video that its owner published (`getPublicVideoDetail` returns
 * null for anything PRIVATE, which is what the notFound() below relies on).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const video = await getPublicVideoDetail(id);
  if (!video) notFound();

  const origin = await appOrigin();

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <VideoPlayer
        src={videoSrc(video)}
        poster={videoPosterSrc(video)}
        filename={video.name}
        durationSec={video.durationSec}
        size={video.size}
        fill
        className="rounded-none"
      />

      {/* Attribution back to the source — an embed with no way home is a dead end. */}
      <Link
        href={`${origin}/watch/${video.id}`}
        target="_blank"
        rel="noopener"
        className="absolute left-3 top-3 z-40 flex max-w-[70%] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white opacity-70 backdrop-blur transition-opacity hover:bg-black/70 hover:opacity-100 focus-visible:opacity-100"
      >
        <span className="truncate">{video.name}</span>
        <ExternalLink size={13} aria-hidden />
      </Link>
    </div>
  );
}
