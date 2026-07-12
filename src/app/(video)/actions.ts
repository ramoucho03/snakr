"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { requireOwner, requireWrite, effectiveLevel } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isPubliclyWatchable, type VideoVisibility } from "@/lib/videos";
import { ensurePublishedDerivatives } from "@/lib/derivatives";
import {
  listComments,
  createComment,
  editCommentBody,
  deleteCommentById,
  toggleCommentLike,
  setCommentPinned,
  setCommentHearted,
  getCommentContext,
  type CommentDTO,
} from "@/lib/comments";
import { setReaction, type ReactionSummary } from "@/lib/reactions";
import { toggleSubscription, type SubscribeState } from "@/lib/subscriptions";
import type { SessionUser } from "@/lib/dal";

/**
 * Social mutations for the video experience — comments, reactions, subscriptions,
 * publishing. Every action re-authenticates and re-authorizes through the DAL;
 * a client capability is never trusted. Comment mutations return the freshly
 * rebuilt thread so the UI just swaps its state (no client-side tree surgery).
 */

type Ok<T = unknown> = { ok: true } & T;
type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

const MAX_COMMENT = 2000;

/** Can this signed-in user watch (hence interact with) the video? */
async function canWatch(user: SessionUser, fileId: string): Promise<boolean> {
  if (await isPubliclyWatchable(fileId)) return true;
  return (await effectiveLevel(user, "FILE", fileId)) != null;
}

/** True if the caller owns the video (or is an admin). */
async function ownsVideo(user: SessionUser, fileId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const f = await prisma.file.findUnique({ where: { id: fileId }, select: { ownerId: true } });
  return f?.ownerId === user.id;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function postCommentAction(input: {
  fileId: string;
  body: string;
  parentId?: string | null;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const body = input.body.trim();
    if (!body) return fail("Commentaire vide");
    if (body.length > MAX_COMMENT) return fail("Commentaire trop long");
    if (!(await canWatch(user, input.fileId))) return fail("Accès refusé");

    // A reply must target a top-level comment on the same video.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await getCommentContext(input.parentId);
      if (!parent || parent.fileId !== input.fileId) return fail("Réponse invalide");
      parentId = parent.parentId ?? parent.id; // flatten reply-to-reply
    }

    await createComment({ fileId: input.fileId, authorId: user.id, body, parentId });
    revalidatePath(`/videos/${input.fileId}`);
    return { ok: true, comments: await listComments(input.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Publication impossible");
  }
}

export async function editCommentAction(input: {
  commentId: string;
  body: string;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const body = input.body.trim();
    if (!body) return fail("Commentaire vide");
    if (body.length > MAX_COMMENT) return fail("Commentaire trop long");
    const ctx = await getCommentContext(input.commentId);
    if (!ctx) return fail("Commentaire introuvable");
    if (ctx.authorId !== user.id) return fail("Action non autorisée");
    await editCommentBody(input.commentId, body);
    revalidatePath(`/videos/${ctx.fileId}`);
    return { ok: true, comments: await listComments(ctx.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Modification impossible");
  }
}

export async function deleteCommentAction(input: {
  commentId: string;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const ctx = await getCommentContext(input.commentId);
    if (!ctx) return fail("Commentaire introuvable");
    // Author OR the video owner (moderation) may delete.
    if (ctx.authorId !== user.id && !(await ownsVideo(user, ctx.fileId))) {
      return fail("Action non autorisée");
    }
    await deleteCommentById(input.commentId);
    revalidatePath(`/videos/${ctx.fileId}`);
    return { ok: true, comments: await listComments(ctx.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Suppression impossible");
  }
}

export async function likeCommentAction(input: {
  commentId: string;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const ctx = await getCommentContext(input.commentId);
    if (!ctx) return fail("Commentaire introuvable");
    if (!(await canWatch(user, ctx.fileId))) return fail("Accès refusé");
    await toggleCommentLike(input.commentId, user.id);
    return { ok: true, comments: await listComments(ctx.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

export async function pinCommentAction(input: {
  commentId: string;
  pinned: boolean;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const ctx = await getCommentContext(input.commentId);
    if (!ctx) return fail("Commentaire introuvable");
    if (!(await ownsVideo(user, ctx.fileId))) return fail("Action réservée au propriétaire");
    await setCommentPinned(ctx.fileId, input.commentId, input.pinned);
    revalidatePath(`/videos/${ctx.fileId}`);
    return { ok: true, comments: await listComments(ctx.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

export async function heartCommentAction(input: {
  commentId: string;
  hearted: boolean;
}): Promise<Ok<{ comments: CommentDTO[] }> | Fail> {
  try {
    const user = await requireUser();
    const ctx = await getCommentContext(input.commentId);
    if (!ctx) return fail("Commentaire introuvable");
    if (!(await ownsVideo(user, ctx.fileId))) return fail("Action réservée au propriétaire");
    await setCommentHearted(input.commentId, input.hearted);
    return { ok: true, comments: await listComments(ctx.fileId, user.id) };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────────

export async function reactAction(input: {
  fileId: string;
  kind: "LIKE" | "DISLIKE";
}): Promise<Ok<{ summary: ReactionSummary }> | Fail> {
  try {
    const user = await requireUser();
    if (!(await canWatch(user, input.fileId))) return fail("Accès refusé");
    const summary = await setReaction(input.fileId, user.id, input.kind);
    return { ok: true, summary };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function subscribeAction(input: {
  channelId: string;
}): Promise<Ok<{ state: SubscribeState }> | Fail> {
  try {
    const user = await requireUser();
    if (user.id === input.channelId) return fail("Impossible de s'abonner à soi-même");
    const state = await toggleSubscription(user.id, input.channelId);
    revalidatePath(`/channel/${input.channelId}`);
    return { ok: true, state };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

// ── Publishing (owner) ────────────────────────────────────────────────────────

export async function setVisibilityAction(input: {
  fileId: string;
  visibility: VideoVisibility;
}): Promise<Ok<{ visibility: VideoVisibility }> | Fail> {
  try {
    await requireUser();
    await requireOwner("FILE", input.fileId);
    const current = await prisma.file.findUnique({
      where: { id: input.fileId },
      select: { publishedAt: true, blobHash: true },
    });
    await prisma.file.update({
      where: { id: input.fileId },
      data: {
        visibility: input.visibility,
        // Stamp the first publish so channels can order by it.
        ...(input.visibility !== "PRIVATE" && !current?.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    // Publishing is what earns a video its social poster, its hover clip and its
    // moov-first remux: a private video never pays the CPU or the disk for any
    // of them. Backgrounded, so whoever pastes the link first waits on nothing.
    if (input.visibility !== "PRIVATE" && current) {
      ensurePublishedDerivatives(current.blobHash);
    }

    revalidatePath(`/videos/${input.fileId}`);
    return { ok: true, visibility: input.visibility };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

export async function setDescriptionAction(input: {
  fileId: string;
  description: string;
}): Promise<Ok<{ description: string }> | Fail> {
  try {
    await requireUser();
    await requireWrite("FILE", input.fileId);
    const description = input.description.trim().slice(0, 5000);
    await prisma.file.update({ where: { id: input.fileId }, data: { description } });
    revalidatePath(`/videos/${input.fileId}`);
    return { ok: true, description };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}
