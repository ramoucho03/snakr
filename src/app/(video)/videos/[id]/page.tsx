import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { effectiveLevel } from "@/lib/access";
import { getVideoDetail, listAccessibleVideos, isPubliclyWatchable } from "@/lib/videos";
import { getChannelBadge } from "@/lib/channel";
import { getReactionSummary } from "@/lib/reactions";
import { listComments } from "@/lib/comments";
import { serverEnv } from "@/lib/env";
import { WatchView } from "@/components/video/watch-view";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";

const serialize = (v: { createdAt: Date } & Omit<VideoItem, "createdAt">): VideoItem => ({
  ...v,
  createdAt: v.createdAt.toISOString(),
});

async function shareOrigin(): Promise<string> {
  const env = serverEnv().APP_URL;
  if (env) return env.replace(/\/$/, "");
  return `https://${(await headers()).get("host") ?? "localhost"}`;
}

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
  return { title: video ? video.name : "Vidéo" };
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

  const [all, channel, reactions, comments, origin] = await Promise.all([
    listAccessibleVideos(user),
    getChannelBadge(video.ownerId, user.id),
    getReactionSummary(id, user.id),
    listComments(id, user.id),
    shareOrigin(),
  ]);
  if (!channel) notFound();

  const related = all.filter((v) => v.id !== id).slice(0, 24);

  return (
    <WatchView
      key={video.id}
      video={serialize(video)}
      related={related.map(serialize)}
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
