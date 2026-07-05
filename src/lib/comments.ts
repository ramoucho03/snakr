import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Threaded video comments. Two levels only (comment → replies), like YouTube:
 * a reply to a reply is still attached to the top-level thread. `listComments`
 * returns everything a video's page needs in a single round trip; mutations are
 * thin DB helpers that the server actions call AFTER authorizing the caller.
 */

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: Date;
  edited: boolean;
  pinned: boolean;
  heartedByOwner: boolean;
  authorId: string;
  authorName: string;
  authorHandle: string | null;
  authorHasAvatar: boolean;
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  replies: CommentDTO[];
}

function commentSelect(viewerId: string | null) {
  return {
    id: true,
    body: true,
    createdAt: true,
    edited: true,
    pinned: true,
    heartedByOwner: true,
    authorId: true,
    parentId: true,
    author: { select: { displayName: true, email: true, handle: true, avatarKey: true } },
    _count: { select: { likes: true } },
    likes: viewerId
      ? { where: { userId: viewerId }, select: { userId: true } }
      : { where: { userId: "" }, select: { userId: true } },
  } satisfies Prisma.CommentSelect;
}

type Row = Prisma.CommentGetPayload<{ select: ReturnType<typeof commentSelect> }>;

function toDTO(row: Row, viewerId: string | null): CommentDTO {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    edited: row.edited,
    pinned: row.pinned,
    heartedByOwner: row.heartedByOwner,
    authorId: row.authorId,
    authorName: row.author.displayName ?? row.author.email.split("@")[0],
    authorHandle: row.author.handle,
    authorHasAvatar: row.author.avatarKey != null,
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    mine: viewerId != null && row.authorId === viewerId,
    replies: [],
  };
}

/** All comments for a video, nested one level, pinned first then newest. */
export async function listComments(
  fileId: string,
  viewerId: string | null,
): Promise<CommentDTO[]> {
  const rows = await prisma.comment.findMany({
    where: { fileId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: commentSelect(viewerId),
  });

  const byId = new Map<string, CommentDTO>();
  const tops: CommentDTO[] = [];
  const childRows: Row[] = [];

  for (const r of rows) {
    if (r.parentId) {
      childRows.push(r);
    } else {
      const dto = toDTO(r, viewerId);
      byId.set(r.id, dto);
      tops.push(dto);
    }
  }
  // Replies oldest-first under their parent.
  childRows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .forEach((r) => {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.replies.push(toDTO(r, viewerId));
    });

  return tops;
}

export async function countComments(fileId: string): Promise<number> {
  return prisma.comment.count({ where: { fileId } });
}

// ── Mutation helpers (callers authorize first) ────────────────────────────────

/** Fetch the rows an action needs to authorize a mutation on a comment. */
export async function getCommentContext(commentId: string) {
  return prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, fileId: true, parentId: true },
  });
}

export async function createComment(input: {
  fileId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
}): Promise<void> {
  await prisma.comment.create({
    data: {
      fileId: input.fileId,
      authorId: input.authorId,
      body: input.body,
      parentId: input.parentId ?? null,
    },
  });
}

export async function editCommentBody(commentId: string, body: string): Promise<void> {
  await prisma.comment.update({
    where: { id: commentId },
    data: { body, edited: true },
  });
}

export async function deleteCommentById(commentId: string): Promise<void> {
  await prisma.comment.delete({ where: { id: commentId } });
}

export async function toggleCommentLike(commentId: string, userId: string): Promise<void> {
  const existing = await prisma.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
    select: { userId: true },
  });
  if (existing) {
    await prisma.commentLike.delete({ where: { commentId_userId: { commentId, userId } } });
  } else {
    await prisma.commentLike.create({ data: { commentId, userId } });
  }
}

/** Pin (exclusively) or unpin a comment within its video. */
export async function setCommentPinned(
  fileId: string,
  commentId: string,
  pinned: boolean,
): Promise<void> {
  await prisma.$transaction([
    prisma.comment.updateMany({ where: { fileId }, data: { pinned: false } }),
    ...(pinned
      ? [prisma.comment.update({ where: { id: commentId }, data: { pinned: true } })]
      : []),
  ]);
}

export async function setCommentHearted(
  commentId: string,
  hearted: boolean,
): Promise<void> {
  await prisma.comment.update({
    where: { id: commentId },
    data: { heartedByOwner: hearted },
  });
}
