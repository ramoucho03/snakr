import { requireUser } from "@/lib/dal";
import { listAccessibleVideos } from "@/lib/videos";
import { VideoHub } from "@/components/video/video-hub";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos" };

export default async function VideosPage() {
  const user = await requireUser();
  const videos = await listAccessibleVideos(user);

  // Serialize Dates to ISO strings across the RSC → client boundary.
  const items: VideoItem[] = videos.map((v) => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
  }));

  return <VideoHub videos={items} />;
}
