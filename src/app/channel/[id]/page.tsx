import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getChannelProfile } from "@/lib/channel";
import { listPublicChannelVideos, listOwnChannelVideos } from "@/lib/videos";
import { PublicHeader } from "@/components/layout/public-header";
import { ChannelView } from "@/components/channel/channel-view";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const channel = await getChannelProfile(id, null);
  return { title: channel ? `${channel.name} — Chaîne` : "Chaîne" };
}

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const channel = await getChannelProfile(id, viewer?.id ?? null);
  if (!channel) notFound();

  const raw = channel.isOwner ? await listOwnChannelVideos(channel.id) : await listPublicChannelVideos(channel.id);
  const videos: VideoItem[] = raw.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader viewer={viewer ? { id: viewer.id, displayName: viewer.displayName, email: viewer.email, avatarKey: viewer.avatarKey, handle: viewer.handle } : null} />
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <ChannelView channel={channel} videos={videos} canSubscribe={viewer != null} />
      </main>
    </div>
  );
}
