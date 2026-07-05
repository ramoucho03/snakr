export type VideoVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

/** Client-side video shape — `createdAt` serialized to an ISO string at the RSC boundary. */
export interface VideoItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
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
