import { requireUser } from "@/lib/dal";
import { listAccessibleVideos, listSubscriptionFeed } from "@/lib/videos";
import { VideoHub } from "@/components/video/video-hub";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos" };

const serialize = (v: { createdAt: Date } & Omit<VideoItem, "createdAt">): VideoItem => ({
  ...v,
  createdAt: v.createdAt.toISOString(),
});

export default async function VideosPage() {
  const user = await requireUser();
  const [videos, subs] = await Promise.all([
    listAccessibleVideos(user),
    listSubscriptionFeed(user.id),
  ]);

  return <VideoHub videos={videos.map(serialize)} subscriptions={subs.map(serialize)} />;
}
