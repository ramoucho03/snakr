import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { backfillProbes, ensureProbe } from "./derivatives";
import type { SessionUser } from "./dal";
import type { VideoItem } from "@/components/video/types";

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
  /** Bytes of the ORIGINAL blob. With `durationSec` this gives the mean bitrate. */
  size: number;
  mime: string;
  createdAt: Date;
  hasThumb: boolean;
  /** A 1280×720 still exists — the social card image and the player poster. */
  hasPoster: boolean;
  /** A short silent clip exists — the hover preview streams that, not the source. */
  hasPreview: boolean;
  /**
   * A moov-first remux exists. The page pins it into the media URL (`?v=fast`)
   * so the served representation never changes mid-playback.
   */
  hasFast: boolean;
  /** ffprobe results; null until the blob has been probed (or if it can't be). */
  durationSec: number | null;
  width: number | null;
  height: number | null;
  ownerId: string;
  ownerName: string;
  ownerHandle: string | null;
  ownerHasAvatar: boolean;
  owned: boolean;
  starred: boolean;
  visibility: VideoVisibility;
  viewCount: number;
  description: string | null;
  /** Internal: lets a caller kick off a lazy derivative without a second query. */
  blobHash: string;
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
  blobHash: true,
  owner: { select: { displayName: true, email: true, handle: true, avatarKey: true } },
  blob: {
    select: {
      size: true,
      mimeType: true,
      durationSec: true,
      width: true,
      height: true,
      derivatives: { select: { kind: true } },
    },
  },
} satisfies Prisma.FileSelect;

type VideoRow = Prisma.FileGetPayload<{ select: typeof videoSelect }>;

function toDTO(f: VideoRow, userId: string | null): VideoDTO {
  const kinds = new Set(f.blob.derivatives.map((d) => d.kind));
  return {
    id: f.id,
    name: f.name,
    size: Number(f.blob.size),
    mime: f.blob.mimeType,
    createdAt: f.createdAt,
    hasThumb: kinds.has("thumb"),
    hasPoster: kinds.has("poster"),
    hasPreview: kinds.has("preview"),
    hasFast: kinds.has("fast"),
    durationSec: f.blob.durationSec,
    width: f.blob.width,
    height: f.blob.height,
    ownerId: f.ownerId,
    ownerName: f.owner.displayName ?? f.owner.email,
    ownerHandle: f.owner.handle,
    ownerHasAvatar: f.owner.avatarKey != null,
    owned: userId != null && f.ownerId === userId,
    starred: f.starred,
    visibility: f.visibility,
    viewCount: f.viewCount,
    description: f.description,
    blobHash: f.blobHash,
  };
}

/**
 * The RSC boundary: Date → ISO string, and `blobHash` dropped. The content hash
 * is a server-side handle (it names the bytes on disk); shipping it to the
 * browser would hand every visitor a dedup oracle for other people's files.
 */
export function serializeVideo(v: VideoDTO): VideoItem {
  const { blobHash: _blobHash, createdAt, ...rest } = v;
  return { ...rest, createdAt: createdAt.toISOString() };
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

/** Rows a listing will ever hand a client. The hub filters/sorts in the browser. */
const LIST_LIMIT = 200;

/**
 * Blobs a listing surfaced that have never been probed get one bounded,
 * fire-and-forget ffprobe pass. Nothing awaits it: the duration badge simply
 * appears on the next render, and content uploaded before the probe pipeline
 * existed heals itself without a migration script.
 */
function healProbes(rows: VideoDTO[]): void {
  backfillProbes(rows.filter((v) => v.durationSec == null).map((v) => v.blobHash));
}

/** All videos the user can watch, newest first. */
export async function listAccessibleVideos(user: SessionUser): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: await accessibleFileWhere(user),
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: videoSelect,
  });
  const rows = files.map((f) => toDTO(f, user.id));
  healProbes(rows);
  return rows;
}

/**
 * A single video for the watch page. Returns null for a non-video id so the
 * page 404s. The CALLER must have already passed requireRead — this trusts it.
 *
 * Unlike a listing this AWAITS the probe: the player needs the duration to size
 * its start-up buffer, and the social card needs it for `og:video:duration`.
 * ffprobe reads headers only, so the wait is milliseconds and happens once ever.
 */
export async function getVideoDetail(id: string, userId: string): Promise<VideoDTO | null> {
  const f = await prisma.file.findFirst({
    where: { id, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
    select: videoSelect,
  });
  if (!f) return null;
  return withProbe(f, userId);
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
  if (!f) return null;
  return withProbe(f, null);
}

/** How long a page will wait on a cold probe before rendering without it. */
const PROBE_WAIT_MS = 3000;

/**
 * Probe on the spot when a detail page needs a duration we have not measured
 * yet. Bounded: ffprobe reads headers in milliseconds, but a wedged binary must
 * never hold a page hostage. The probe keeps running in the background (it is
 * deduplicated by blob hash), so the next render has the answer.
 */
async function withProbe(f: VideoRow, userId: string | null): Promise<VideoDTO> {
  const dto = toDTO(f, userId);
  if (dto.durationSec != null) return dto;

  const probed = await Promise.race([
    ensureProbe(dto.blobHash).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_WAIT_MS)),
  ]).catch(() => false);
  if (!probed) return dto;

  const blob = await prisma.blob.findUnique({
    where: { hash: dto.blobHash },
    select: { durationSec: true, width: true, height: true },
  });
  return blob ? { ...dto, ...blob } : dto;
}

/**
 * THE ACL bypass, as a pure predicate over columns a caller has already loaded.
 * Every byte route derives "may an anonymous visitor have this?" from here, so
 * the rule lives in exactly one place: a published video, and nothing else.
 */
export function isWatchableRow(row: {
  visibility: VideoVisibility;
  blob: { mimeType: string };
}): boolean {
  return (
    (row.visibility === "PUBLIC" || row.visibility === "UNLISTED") &&
    (VIDEO_MIMES as readonly string[]).includes(row.blob.mimeType)
  );
}

/** Is this file a public/unlisted video? For callers that hold only an id. */
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
    take: LIST_LIMIT,
    select: videoSelect,
  });
  const rows = files.map((f) => toDTO(f, null));
  healProbes(rows);
  return rows;
}

/**
 * Every PUBLIC video on the instance, for the sitemap. Strictly PUBLIC —
 * UNLISTED is link-only and must never be enumerated.
 */
export async function listAllPublicVideos(): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: { visibility: "PUBLIC", blob: { mimeType: { in: [...VIDEO_MIMES] } } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 5000,
    select: videoSelect,
  });
  return files.map((f) => toDTO(f, null));
}

/** Every video a channel owns (owner's own view of their channel). */
export async function listOwnChannelVideos(channelId: string): Promise<VideoDTO[]> {
  const files = await prisma.file.findMany({
    where: { ownerId: channelId, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: videoSelect,
  });
  const rows = files.map((f) => toDTO(f, channelId));
  healProbes(rows);
  return rows;
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
  const rows = files.map((f) => toDTO(f, userId));
  healProbes(rows);
  return rows;
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
