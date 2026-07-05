import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { requireRead } from "@/lib/access";
import { getVideoDetail, listAccessibleVideos } from "@/lib/videos";
import { WatchView } from "@/components/video/watch-view";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";

const serialize = (v: {
  createdAt: Date;
} & Omit<VideoItem, "createdAt">): VideoItem => ({
  ...v,
  createdAt: v.createdAt.toISOString(),
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Vidéo" };
  try {
    await requireRead("FILE", id);
  } catch {
    return { title: "Vidéo" };
  }
  const video = await getVideoDetail(id, user.id);
  return { title: video ? video.name : "Vidéo" };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  // The security boundary — a 404 (not 403) so we never leak existence.
  try {
    await requireRead("FILE", id);
  } catch {
    notFound();
  }

  const video = await getVideoDetail(id, user.id);
  if (!video) notFound();

  const all = await listAccessibleVideos(user);
  const related = all.filter((v) => v.id !== id).slice(0, 24);

  return (
    <WatchView
      key={video.id}
      video={serialize(video)}
      related={related.map(serialize)}
    />
  );
}
