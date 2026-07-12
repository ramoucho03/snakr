import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getChannelProfile } from "@/lib/channel";
import { listPublicChannelVideos, listOwnChannelVideos, serializeVideo } from "@/lib/videos";
import { storageSummary } from "@/lib/files";
import { appOrigin } from "@/lib/url";
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
  const [channel, origin] = await Promise.all([
    getChannelProfile(id, null).catch(() => null),
    appOrigin(),
  ]);
  if (!channel) return { title: "Chaîne" };

  const url = `${origin}/channel/${channel.handle ?? channel.id}`;
  const description = channel.bio?.slice(0, 300) ?? `La chaîne de ${channel.name} sur Snak'r.`;
  // The banner is the better card image; the avatar is square and crops badly.
  const image = channel.hasBanner
    ? `${origin}/api/users/${channel.id}/banner`
    : channel.hasAvatar
      ? `${origin}/api/users/${channel.id}/avatar`
      : `${origin}/brand/og-cover.jpg`;

  return {
    metadataBase: new URL(origin),
    title: `${channel.name} — Chaîne`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      siteName: "Snak'r",
      title: channel.name,
      description,
      url,
      images: [{ url: image, alt: channel.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: channel.name,
      description,
      images: [image],
    },
  };
}

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();

  const channel = await getChannelProfile(id, viewer?.id ?? null);
  if (!channel) notFound();

  const raw = channel.isOwner
    ? await listOwnChannelVideos(channel.id)
    : await listPublicChannelVideos(channel.id);
  const videos: VideoItem[] = raw.map(serializeVideo);

  const origin = await appOrigin();
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
