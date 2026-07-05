import "server-only";
import { prisma } from "./db";
import { VIDEO_MIMES } from "./videos";

/**
 * At-a-glance metrics for the drive dashboard hero. All counts are scoped to the
 * user's OWN library (owner = user); sharing lives on its own pages. One batched
 * round-trip so the overview never costs more than a single render's worth of DB.
 */
export interface DashboardStats {
  storageUsed: number;
  storageLimit: number | null;
  fileCount: number;
  folderCount: number;
  videoCount: number;
  shareCount: number;
  starredCount: number;
}

export async function dashboardStats(userId: string): Promise<DashboardStats> {
  const [user, fileCount, folderCount, videoCount, shareCount, starredCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { storageUsed: true, storageLimit: true },
      }),
      prisma.file.count({ where: { ownerId: userId } }),
      prisma.folder.count({ where: { ownerId: userId } }),
      prisma.file.count({
        where: { ownerId: userId, blob: { mimeType: { in: [...VIDEO_MIMES] } } },
      }),
      prisma.share.count({ where: { createdById: userId, revokedAt: null } }),
      prisma.file.count({ where: { ownerId: userId, starred: true } }),
    ]);

  return {
    storageUsed: Number(user?.storageUsed ?? 0),
    storageLimit: user?.storageLimit == null ? null : Number(user.storageLimit),
    fileCount,
    folderCount,
    videoCount,
    shareCount,
    starredCount,
  };
}
