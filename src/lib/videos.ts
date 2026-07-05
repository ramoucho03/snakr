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
 */

export const VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
] as const;

export interface VideoDTO {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: Date;
  hasThumb: boolean;
  ownerName: string;
  owned: boolean;
  starred: boolean;
}

const videoSelect = {
  id: true,
  name: true,
  ownerId: true,
  starred: true,
  createdAt: true,
  owner: { select: { displayName: true, email: true } },
  blob: {
    select: {
      size: true,
      mimeType: true,
      derivatives: { where: { kind: "thumb" }, select: { id: true } },
    },
  },
} satisfies Prisma.FileSelect;

type VideoRow = Prisma.FileGetPayload<{ select: typeof videoSelect }>;

function toDTO(f: VideoRow, userId: string): VideoDTO {
  return {
    id: f.id,
    name: f.name,
    size: Number(f.blob.size),
    mime: f.blob.mimeType,
    createdAt: f.createdAt,
    hasThumb: f.blob.derivatives.length > 0,
    ownerName: f.owner.displayName ?? f.owner.email,
    owned: f.ownerId === userId,
    starred: f.starred,
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
