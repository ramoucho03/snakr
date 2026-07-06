import "server-only";
import { prisma } from "./db";
import { VIDEO_MIMES } from "./videos";
import { getSubscribeState } from "./subscriptions";

/**
 * Channel = a User's public face. Anyone (even signed-out) can view a channel;
 * they just only see its PUBLIC videos. The owner viewing their own channel sees
 * everything and gets edit affordances.
 */
export interface ChannelProfile {
  id: string;
  name: string;
  handle: string | null;
  bio: string | null;
  accentColor: string | null;
  hasAvatar: boolean;
  hasBanner: boolean;
  memberSince: Date;
  publicVideoCount: number;
  totalViews: number;
  subscriberCount: number;
  subscribed: boolean;
  isOwner: boolean;
}

/** A `@handle`, a raw handle, or a user id all resolve to the same channel. */
export async function resolveChannelId(idOrHandle: string): Promise<string | null> {
  // A malformed percent-escape must not 500 the page — fall back to the raw param.
  let raw = idOrHandle;
  try {
    raw = decodeURIComponent(idOrHandle);
  } catch {
    /* keep the undecoded value */
  }
  const handle = (raw.startsWith("@") ? raw.slice(1) : raw).toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: raw }, { handle }] },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getChannelProfile(
  idOrHandle: string,
  viewerId: string | null,
): Promise<ChannelProfile | null> {
  const channelId = await resolveChannelId(idOrHandle);
  if (!channelId) return null;

  const user = await prisma.user.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      displayName: true,
      email: true,
      handle: true,
      bio: true,
      accentColor: true,
      avatarKey: true,
      bannerKey: true,
      createdAt: true,
      isSuspended: true,
    },
  });
  if (!user || user.isSuspended) return null;

  const publicVideoWhere = {
    ownerId: channelId,
    visibility: "PUBLIC" as const,
    blob: { mimeType: { in: [...VIDEO_MIMES] } },
  };
  // These are non-critical stats — a channel must still render if one hiccups,
  // so failures degrade to zero rather than 500-ing the whole page.
  const [countRes, viewsRes, subRes] = await Promise.allSettled([
    prisma.file.count({ where: publicVideoWhere }),
    prisma.file.aggregate({ where: publicVideoWhere, _sum: { viewCount: true } }),
    getSubscribeState(channelId, viewerId),
  ]);
  const publicVideoCount = countRes.status === "fulfilled" ? countRes.value : 0;
  const totalViews = viewsRes.status === "fulfilled" ? (viewsRes.value._sum.viewCount ?? 0) : 0;
  const sub = subRes.status === "fulfilled" ? subRes.value : { count: 0, subscribed: false };

  return {
    id: user.id,
    name: user.displayName ?? user.email.split("@")[0],
    handle: user.handle,
    bio: user.bio,
    accentColor: user.accentColor,
    hasAvatar: user.avatarKey != null,
    hasBanner: user.bannerKey != null,
    memberSince: user.createdAt,
    publicVideoCount,
    totalViews,
    subscriberCount: sub.count,
    subscribed: sub.subscribed,
    isOwner: viewerId != null && viewerId === channelId,
  };
}

/** Lightweight channel header for the watch page (owner block under the title). */
export interface ChannelBadge {
  id: string;
  name: string;
  handle: string | null;
  hasAvatar: boolean;
  subscriberCount: number;
  subscribed: boolean;
  isOwner: boolean;
}

export async function getChannelBadge(
  channelId: string,
  viewerId: string | null,
): Promise<ChannelBadge | null> {
  const user = await prisma.user.findUnique({
    where: { id: channelId },
    select: { id: true, displayName: true, email: true, handle: true, avatarKey: true },
  });
  if (!user) return null;
  const sub = await getSubscribeState(channelId, viewerId);
  return {
    id: user.id,
    name: user.displayName ?? user.email.split("@")[0],
    handle: user.handle,
    hasAvatar: user.avatarKey != null,
    subscriberCount: sub.count,
    subscribed: sub.subscribed,
    isOwner: viewerId != null && viewerId === channelId,
  };
}
