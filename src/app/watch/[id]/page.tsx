import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/dal";
import { getPublicVideoDetail, listPublicChannelVideos } from "@/lib/videos";
import { getChannelBadge } from "@/lib/channel";
import { getReactionSummary } from "@/lib/reactions";
import { listComments } from "@/lib/comments";
import { serverEnv } from "@/lib/env";
import { PublicHeader } from "@/components/layout/public-header";
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
  const video = await getPublicVideoDetail(id);
  return {
    title: video ? video.name : "Vidéo",
    description: video?.description ?? undefined,
  };
}

export default async function PublicWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const video = await getPublicVideoDetail(id);
  if (!video) notFound();

  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  const [channelVideos, channel, reactions, comments, origin] = await Promise.all([
    listPublicChannelVideos(video.ownerId),
    getChannelBadge(video.ownerId, viewerId),
    getReactionSummary(id, viewerId),
    listComments(id, viewerId),
    shareOrigin(),
  ]);
  if (!channel) notFound();

  const related = channelVideos.filter((v) => v.id !== id).slice(0, 24);

  return (
    <div className="flex min-h-dvh flex-col">
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
          video={serialize(video)}
          related={related.map(serialize)}
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
