import { requireUser } from "@/lib/dal";
import { listAccessibleVideos, listSubscriptionFeed, serializeVideo } from "@/lib/videos";
import { VideoHub } from "@/components/video/video-hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos" };

export default async function VideosPage() {
  const user = await requireUser();
  const [videos, subs] = await Promise.all([
    listAccessibleVideos(user),
    listSubscriptionFeed(user.id),
  ]);

  return <VideoHub videos={videos.map(serializeVideo)} subscriptions={subs.map(serializeVideo)} />;
}
