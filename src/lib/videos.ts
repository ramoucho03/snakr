import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./dal";

/**
 * The video hub's data layer. A "video" is any File whose deduplicated Blob was
 * sniffed to a video MIME (magic bytes, never the client's claim — see mime.ts).
 *
 * `listAccessibleVideos` mirrors the authorization core in access.ts: it returns
 * the union of videos the user OWNS, videos granted to them (or their groups)
 * directly, and videos living inside a granted folder or any of its descendants
 * (grants inherit down a subtree). It never leaks a video the caller can't read.
 * The byte-serving route (/api/files/[id]) re-checks access regardless, so this
 * listing is a convenience, not the security boundary.
 *
 * Public videos (visibility PUBLIC / UNLISTED) are readable anonymously; those
 * paths live in the `getPublicVideoDetail` / `listPublicChannelVideos` helpers
 * and are the ONLY functions here that skip the ACL by design.
 */

export const VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
] as const;

export type VideoVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

export interface VideoDTO {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: Date;
  hasThumb: boolean;
  ownerId: string;
  ownerName: string;
  ownerHandle: string | null;
  ownerHasAvatar: boolean;
  owned: boolean;
  starred: boolean;
  visibility: VideoVisibility;
  viewCount: number;
  description: string | null;
}

const videoSelect = {
  id: true,
  name: true,
  ownerId: true,
  starred: true,
  createdAt: true,
  visibility: true,
  viewCount: true,
  description: true,
  owner: { select: { displayName: true, email: true, handle: true, avatarKey: true } },
  blob: {
    select: {
      size: true,
      mimeType: true,
      derivatives: { where: { kind: "thumb" }, select: { id: true } },
    },
  },
} satisfies Prisma.FileSelect;

type VideoRow = Prisma.FileGetPayload<{ select: typeof videoSelect }>;

function toDTO(f: VideoRow, userId: string | null): VideoDTO {
  return {
    id: f.id,
    name: f.name,
    size: Number(f.blob.size),
    mime: f.blob.mimeType,
    createdAt: f.createdAt,
    hasThumb: f.blob.derivatives.length > 0,
    ownerId: f.ownerId,
    ownerName: f.owner.displayName ?? f.owner.email,
    ownerHandle: f.owner.handle,
    ownerHasAvatar: f.owner.avatarKey != null,
    owned: userId != null && f.ownerId === userId,
    starred: f.starred,
    visibility: f.visibility,
    viewCount: f.viewCount,
    description: f.description,
  };
}

/** Every folder id whose grants reach this user: the granted folders + subtrees. */
async function grantedFolderScope(rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const roots = await prisma.folder.findMany({
    where: { id: { in: rootIds } },
    select: { id: true, path: true },
  });
  const scope = new Set(rootIds);
  if (roots.length) {
    const descendants = await prisma.folder.findMany({
      where: { OR: roots.map((r) => ({ path: { startsWith: `${r.path}${r.id}/` } })) },
      select: { id: true },
    });
    for (const d of descendants) scope.add(d.id);
  }
  return [...scope];
}

/** The OR clause of File conditions the user is allowed to see, scoped to videos. */
async function accessibleFileWhere(user: SessionUser): Promise<Prisma.FileWhereInput> {
  const groupIds = (
    await prisma.groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    })
  ).map((g) => g.groupId);

  const grants = await prisma.permission.findMany({
    where: {
      OR: [
        { principalType: "USER", principalId: user.id },
        ...(groupIds.length
          ? [{ principalType: "GROUP" as const, principalId: { in: groupIds } }]
          : []),
      ],
    },
    select: { resourceType: true, resourceId: true },
  });

  const grantedFileIds = grants
    .filter((g) => g.resourceType === "FILE")
    .map((g) => g.resourceId);
  const folderScope = await grantedFolderScope(
    grants.filter((g) => g.resourceType === "FOLDER").map((g) => g.resourceId),
  );

  const or: Prisma.FileWhereInput[] = [{ ownerId: user.id }];
  if (grantedFileIds.length) or.push({ id: { in: grantedFileIds } });
  if (folderScope.length) or.push({ folderId: { in: folderScope } });
  // PUBLIC videos are part of the shared network and discoverable by everyone.
  // UNLISTED is deliberately excluded here — it is link-only, never listed.
  or.push({ visibility: "PUBLIC" });

  return { blob: { mimeType: { in: [...VIDEO_MIMES] } }, OR: or };
}

/** All videos the user can watch, newest first. */
export async function listAccessibleVideos(user: SessionUser): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: await accessibleFileWhere(user),
    orderBy: { createdAt: "desc" },
    select: videoSelect,
  });
  return files.map((f) => toDTO(f, user.id));
}

/**
 * A single video for the watch page. Returns null for a non-video id so the
 * page 404s. The CALLER must have already passed requireRead — this trusts it.
 */
export async function getVideoDetail(id: string, userId: string): Promise<VideoDTO | null> {
  const f = await prisma.file.findFirst({
    where: { id, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
    select: videoSelect,
  });
  return f ? toDTO(f, userId) : null;
}

/**
 * A public/unlisted video for the anonymous /watch page. Returns null unless the
 * video exists AND its owner has published it (visibility != PRIVATE). This is a
 * deliberate ACL bypass — the ONLY read path that serves a video to a visitor
 * with no session.
 */
export async function getPublicVideoDetail(id: string): Promise<VideoDTO | null> {
  const f = await prisma.file.findFirst({
    where: {
      id,
      visibility: { in: ["PUBLIC", "UNLISTED"] },
      blob: { mimeType: { in: [...VIDEO_MIMES] } },
    },
    select: videoSelect,
  });
  return f ? toDTO(f, null) : null;
}

/** Is this file a public/unlisted video? Used by the byte route to serve anon. */
export async function isPubliclyWatchable(id: string): Promise<boolean> {
  const f = await prisma.file.findFirst({
    where: {
      id,
      visibility: { in: ["PUBLIC", "UNLISTED"] },
      blob: { mimeType: { in: [...VIDEO_MIMES] } },
    },
    select: { id: true },
  });
  return f != null;
}

/** Videos published PUBLIC by a channel, newest first (anonymous-safe). */
export async function listPublicChannelVideos(channelId: string): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: {
      ownerId: channelId,
      visibility: "PUBLIC",
      blob: { mimeType: { in: [...VIDEO_MIMES] } },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: videoSelect,
  });
  return files.map((f) => toDTO(f, null));
}

/** Every video a channel owns (owner's own view of their channel). */
export async function listOwnChannelVideos(channelId: string): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: { ownerId: channelId, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
    orderBy: { createdAt: "desc" },
    select: videoSelect,
  });
  return files.map((f) => toDTO(f, channelId));
}

/**
 * The "subscriptions" feed: recent public videos from channels the viewer
 * follows, newest first.
 */
export async function listSubscriptionFeed(userId: string): Promise<VideoDTO[]> {
  const subs = await prisma.subscription.findMany({
    where: { subscriberId: userId },
    select: { channelId: true },
  });
  if (subs.length === 0) return [];
  const files = await prisma.file.findMany({
    where: {
      ownerId: { in: subs.map((s) => s.channelId) },
      visibility: "PUBLIC",
      blob: { mimeType: { in: [...VIDEO_MIMES] } },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: videoSelect,
  });
  return files.map((f) => toDTO(f, userId));
}

/**
 * Best-effort view increment. Called from a POST route after the client has
 * actually started playback; deduplication is handled client-side (one ping per
 * session) so this stays a single cheap UPDATE.
 */
export async function incrementView(id: string): Promise<void> {
  await prisma.file
    .updateMany({
      where: { id, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
      data: { viewCount: { increment: 1 } },
    })
    .catch(() => {
      /* non-critical: a missed view must never surface as an error */
    });
}
