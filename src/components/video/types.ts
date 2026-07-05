/** Client-side video shape — `createdAt` serialized to an ISO string at the RSC boundary. */
export interface VideoItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  hasThumb: boolean;
  ownerName: string;
  owned: boolean;
  starred: boolean;
}
