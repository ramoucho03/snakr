import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { effectiveLevel } from "@/lib/access";
import {
  getVideoDetail,
  isPubliclyWatchable,
  listAccessibleVideos,
  serializeVideo,
} from "@/lib/videos";
import { ensurePublishedDerivatives } from "@/lib/derivatives";
import { getChannelBadge } from "@/lib/channel";
import { getReactionSummary } from "@/lib/reactions";
import { listComments } from "@/lib/comments";
import { appOrigin } from "@/lib/url";
import { WatchView } from "@/components/video/watch-view";

export const dynamic = "force-dynamic";

/**
 * No Open Graph here on purpose: this surface sits behind `requireUser`, so a
 * crawler only ever sees the login redirect. The shareable card lives on the
 * public twin at /watch/[id].
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Vidéo" };
  const level = await effectiveLevel(user, "FILE", id);
  if (!level && !(await isPubliclyWatchable(id))) return { title: "Vidéo" };
  const video = await getVideoDetail(id, user.id);
  return { title: video ? video.name : "Vidéo", robots: { index: false, follow: false } };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Readable via the ACL (owner/grant/admin) OR published PUBLIC/UNLISTED.
  // A 404 (not 403) so we never leak existence of a private video.
  const level = await effectiveLevel(user, "FILE", id);
  if (!level && !(await isPubliclyWatchable(id))) notFound();

  const video = await getVideoDetail(id, user.id);
  if (!video) notFound();

  // A published video earns its social poster, its hover clip and its moov-first
  // remux. A private one pays for none of them. The URL this render hands the
  // player is already pinned, so a remux landing later never shifts it mid-stream.
  if (video.visibility !== "PRIVATE") ensurePublishedDerivatives(video.blobHash);

  const [all, channel, reactions, comments, origin] = await Promise.all([
    listAccessibleVideos(user),
    getChannelBadge(video.ownerId, user.id),
    getReactionSummary(id, user.id),
    listComments(id, user.id),
    appOrigin(),
  ]);
  if (!channel) notFound();

  const related = all.filter((v) => v.id !== id).slice(0, 24);

  return (
    <WatchView
      key={video.id}
      video={serializeVideo(video)}
      related={related.map(serializeVideo)}
      channel={channel}
      reactions={reactions}
      comments={comments}
      viewer={{
        id: user.id,
        name: user.displayName ?? user.email,
        hasAvatar: user.avatarKey != null,
      }}
      surface="app"
      shareUrl={`${origin}/watch/${video.id}`}
    />
  );
}
