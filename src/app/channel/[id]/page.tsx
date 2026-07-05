import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/dal";
import { getChannelProfile } from "@/lib/channel";
import { listPublicChannelVideos, listOwnChannelVideos } from "@/lib/videos";
import { storageSummary } from "@/lib/files";
import { serverEnv } from "@/lib/env";
import { AppHeader } from "@/components/layout/app-header";
import { PublicHeader } from "@/components/layout/public-header";
import { ChannelView } from "@/components/channel/channel-view";
import type { VideoItem } from "@/components/video/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const channel = await getChannelProfile(id, null);
  return { title: channel ? `${channel.name} — Chaîne` : "Chaîne" };
}

async function shareOrigin(): Promise<string> {
  const env = serverEnv().APP_URL;
  if (env) return env.replace(/\/$/, "");
  return `https://${(await headers()).get("host") ?? "localhost"}`;
}

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const channel = await getChannelProfile(id, viewer?.id ?? null);
  if (!channel) notFound();

  const raw = channel.isOwner
    ? await listOwnChannelVideos(channel.id)
    : await listPublicChannelVideos(channel.id);
  const videos: VideoItem[] = raw.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));

  const origin = await shareOrigin();
  const shareUrl = `${origin}/channel/${channel.handle ?? channel.id}`;

  // Signed-in members get the full app shell so a channel is a first-class
  // in-app destination; anonymous visitors get the public bar.
  let header: React.ReactNode;
  if (viewer) {
    const { used, limit } = await storageSummary(viewer.id);
    header = (
      <AppHeader
        user={{
          id: viewer.id,
          email: viewer.email,
          displayName: viewer.displayName,
          role: viewer.role,
          avatarKey: viewer.avatarKey,
          handle: viewer.handle,
        }}
        used={used}
        limit={limit}
      />
    );
  } else {
    header = <PublicHeader viewer={null} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <ChannelView
          channel={channel}
          videos={videos}
          canSubscribe={viewer != null}
          shareUrl={shareUrl}
        />
      </main>
    </div>
  );
}
