import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/dal";
import { getPublicVideoDetail, listPublicChannelVideos, serializeVideo } from "@/lib/videos";
import { ensurePublishedDerivatives } from "@/lib/derivatives";
import { getChannelBadge } from "@/lib/channel";
import { getReactionSummary } from "@/lib/reactions";
import { listComments } from "@/lib/comments";
import { appOrigin, isoDuration, jsonLd } from "@/lib/url";
import { PublicHeader } from "@/components/layout/public-header";
import { WatchView } from "@/components/video/watch-view";
import { videoSrc, videoSrcMime } from "@/components/video/types";

export const dynamic = "force-dynamic";

/** The still a scraper will render. Falls back to the grid thumbnail. */
function cardImage(origin: string, video: { id: string; hasPoster: boolean; hasThumb: boolean }) {
  if (video.hasPoster) return { url: `${origin}/api/files/${video.id}/poster`, width: 1280, height: 720 };
  if (video.hasThumb) return { url: `${origin}/api/files/${video.id}/thumb`, width: 640, height: 360 };
  return null;
}

/**
 * The card Facebook, Discord, WhatsApp, Slack, X and iMessage render when this
 * URL is pasted. Three things make it a *video* card rather than a link:
 *   - `og:type = video.other` plus `og:video` pointing at real MP4 bytes, which
 *     is what lets Discord and Facebook play it inline without opening the site;
 *   - a large `og:image` (1280×720 — Facebook wants ≥ 1200px wide);
 *   - `twitter:card = player`, whose iframe is the /embed route.
 * Everything is absolute: a scraper has no base URL to resolve against.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [video, origin] = await Promise.all([getPublicVideoDetail(id), appOrigin()]);
  if (!video) return { title: "Vidéo", robots: { index: false, follow: false } };

  const channel = await getChannelBadge(video.ownerId, null);
  const url = `${origin}/watch/${id}`;
  const description =
    video.description?.slice(0, 300) ??
    `${video.name} — une vidéo de ${channel?.name ?? "Snak'r"} sur Snak'r.`;
  const image = cardImage(origin, video);
  const media = `${origin}${videoSrc(video)}`;
  const width = video.width ?? 1280;
  const height = video.height ?? 720;
  // Facebook validates that `og:video:secure_url` really is https. On a plain
  // HTTP LAN origin, claiming otherwise gets the whole card dropped.
  const secure = origin.startsWith("https://");

  // Next has no first-class field for the duration, and Discord reads it to
  // decide it is looking at a video rather than a photo.
  const duration = video.durationSec ? String(Math.round(video.durationSec)) : null;

  return {
    metadataBase: new URL(origin),
    title: video.name,
    description,
    alternates: {
      canonical: url,
      types: {
        // Discord, Slack, Notion and WordPress ask for oEmbed before falling
        // back to Open Graph; this is the discovery link they look for.
        "application/json+oembed": [
          { url: `${origin}/api/oembed?url=${encodeURIComponent(url)}`, title: video.name },
        ],
      },
    },
    // UNLISTED means "anyone with the link", not "index me".
    robots: video.visibility === "PUBLIC" ? undefined : { index: false, follow: false },
    openGraph: {
      type: "video.other",
      siteName: "Snak'r",
      title: video.name,
      description,
      url,
      ...(image ? { images: [{ ...image, alt: video.name }] } : {}),
      videos: [
        { url: media, ...(secure ? { secureUrl: media } : {}), type: videoSrcMime(video), width, height },
      ],
    },
    twitter: {
      card: "player",
      title: video.name,
      description,
      ...(image ? { images: [image.url] } : {}),
      players: [{ playerUrl: `${origin}/embed/${id}`, streamUrl: media, width, height }],
    },
    ...(duration ? { other: { "og:video:duration": duration, "video:duration": duration } } : {}),
  };
}

export default async function PublicWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const video = await getPublicVideoDetail(id);
  if (!video) notFound();

  // Heals anything published before this pipeline existed. The media URL this
  // render hands the player is already pinned, so a remux landing later takes
  // effect on the NEXT page load and never mid-stream.
  ensurePublishedDerivatives(video.blobHash);

  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  const [channelVideos, channel, reactions, comments, origin] = await Promise.all([
    listPublicChannelVideos(video.ownerId),
    getChannelBadge(video.ownerId, viewerId),
    getReactionSummary(id, viewerId),
    listComments(id, viewerId),
    appOrigin(),
  ]);
  if (!channel) notFound();

  const related = channelVideos.filter((v) => v.id !== id).slice(0, 24);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Google reads this, not the Open Graph tags. Only PUBLIC videos: an UNLISTED
  // one must never become discoverable through structured data.
  const structured =
    video.visibility === "PUBLIC"
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: video.name,
          description: video.description ?? undefined,
          uploadDate: video.createdAt.toISOString(),
          thumbnailUrl: video.hasPoster
            ? [`${origin}/api/files/${id}/poster`]
            : video.hasThumb
              ? [`${origin}/api/files/${id}/thumb`]
              : undefined,
          contentUrl: `${origin}${videoSrc(video)}`,
          encodingFormat: videoSrcMime(video),
          embedUrl: `${origin}/embed/${id}`,
          duration: video.durationSec ? isoDuration(video.durationSec) : undefined,
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: { "@type": "WatchAction" },
            userInteractionCount: video.viewCount,
          },
          author: { "@type": "Person", name: channel.name },
        }
      : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {structured && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(structured) }}
        />
      )}
      <PublicHeader
        viewer={
          viewer
            ? {
                id: viewer.id,
                displayName: viewer.displayName,
                email: viewer.email,
                avatarKey: viewer.avatarKey,
                handle: viewer.handle,
              }
            : null
        }
      />
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <WatchView
          key={video.id}
          video={serializeVideo(video)}
          related={related.map(serializeVideo)}
          channel={channel}
          reactions={reactions}
          comments={comments}
          viewer={
            viewer
              ? { id: viewer.id, name: viewer.displayName ?? viewer.email, hasAvatar: viewer.avatarKey != null }
              : null
          }
          surface="public"
          shareUrl={`${origin}/watch/${video.id}`}
        />
      </main>
    </div>
  );
}
