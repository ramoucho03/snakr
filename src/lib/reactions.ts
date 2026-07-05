import "server-only";
import type { $Enums } from "@prisma/client";
import { prisma } from "./db";

/** Like/dislike tallies for a video plus the viewer's own reaction. */
export interface ReactionSummary {
  likes: number;
  dislikes: number;
  mine: $Enums.ReactionKind | null;
}

export async function getReactionSummary(
  fileId: string,
  viewerId: string | null,
): Promise<ReactionSummary> {
  const [likes, dislikes, mine] = await Promise.all([
    prisma.videoReaction.count({ where: { fileId, kind: "LIKE" } }),
    prisma.videoReaction.count({ where: { fileId, kind: "DISLIKE" } }),
    viewerId
      ? prisma.videoReaction.findUnique({
          where: { fileId_userId: { fileId, userId: viewerId } },
          select: { kind: true },
        })
      : Promise.resolve(null),
  ]);
  return { likes, dislikes, mine: mine?.kind ?? null };
}

/**
 * Toggle a reaction: clicking the current reaction removes it, clicking the
 * other flips it. Returns the fresh summary. Caller must have verified the
 * viewer can READ the video.
 */
export async function setReaction(
  fileId: string,
  userId: string,
  kind: $Enums.ReactionKind,
): Promise<ReactionSummary> {
  const existing = await prisma.videoReaction.findUnique({
    where: { fileId_userId: { fileId, userId } },
    select: { kind: true },
  });

  if (existing?.kind === kind) {
    await prisma.videoReaction.delete({ where: { fileId_userId: { fileId, userId } } });
  } else {
    await prisma.videoReaction.upsert({
      where: { fileId_userId: { fileId, userId } },
      create: { fileId, userId, kind },
      update: { kind },
    });
  }
  return getReactionSummary(fileId, userId);
}
