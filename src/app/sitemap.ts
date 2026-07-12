import type { MetadataRoute } from "next";
import { listAllPublicVideos } from "@/lib/videos";
import { appOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Only PUBLIC videos and the channels that own one. UNLISTED is link-only by
 * definition: enumerating it here would be exactly the leak the visibility
 * setting exists to prevent.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await appOrigin();

  const videos = await listAllPublicVideos().catch(() => []);

  const channels = new Map<string, { handle: string | null; lastModified: Date }>();
  for (const v of videos) {
    if (!channels.has(v.ownerId)) {
      channels.set(v.ownerId, { handle: v.ownerHandle, lastModified: v.createdAt });
    }
  }

  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    ...videos.map((v) => ({
      url: `${origin}/watch/${v.id}`,
      lastModified: v.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...[...channels].map(([id, c]) => ({
      url: `${origin}/channel/${c.handle ?? id}`,
      lastModified: c.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
