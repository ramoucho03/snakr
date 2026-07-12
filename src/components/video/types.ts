export type VideoVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

/**
 * Client-side video shape — `createdAt` serialized to an ISO string at the RSC
 * boundary, and the blob's content hash deliberately withheld (see
 * `serializeVideo` in lib/videos.ts).
 */
export interface VideoItem {
  id: string;
  name: string;
  /** Bytes of the source file. With `durationSec`, this yields the mean bitrate. */
  size: number;
  mime: string;
  createdAt: string;
  hasThumb: boolean;
  hasPoster: boolean;
  hasPreview: boolean;
  /** A moov-first remux exists — the media URL must pin it with `?v=fast`. */
  hasFast: boolean;
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
}

/* ---------------------------------------------------------------------------
   Media URLs. One place decides which representation a page streams, so the
   player, the poster, the hover preview and the social card never disagree.
--------------------------------------------------------------------------- */

/**
 * The bytes to play. `?v=fast` pins the moov-first remux for the whole session:
 * were the variant chosen per-request, a remux landing between two Range
 * requests would shift every byte offset under a player mid-stream.
 */
export function videoSrc(video: Pick<VideoItem, "id" | "hasFast">): string {
  return `/api/files/${video.id}${video.hasFast ? "?v=fast" : ""}`;
}

/**
 * The MIME of the bytes `videoSrc` actually serves. The remux is always MP4,
 * whatever the source was — announcing `video/x-matroska` on an `og:video` that
 * hands back MP4 is how you get Discord to refuse to play it.
 */
export function videoSrcMime(video: Pick<VideoItem, "mime" | "hasFast">): string {
  return video.hasFast ? "video/mp4" : video.mime;
}

/** The full-quality still (1280×720) when we have one, else the grid thumbnail. */
export function videoPosterSrc(
  video: Pick<VideoItem, "id" | "hasPoster" | "hasThumb">,
): string | undefined {
  if (video.hasPoster) return `/api/files/${video.id}/poster`;
  if (video.hasThumb) return `/api/files/${video.id}/thumb`;
  return undefined;
}

/** The original bytes, as uploaded — never the remux. */
export function videoDownloadSrc(video: Pick<VideoItem, "id">): string {
  return `/api/files/${video.id}?dl=1`;
}
