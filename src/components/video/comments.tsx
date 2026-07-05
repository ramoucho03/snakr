"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  ThumbsUp,
  Pin,
  Heart,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toast";
import { cn, formatRelative, formatCount } from "@/lib/utils";
import type { CommentDTO } from "@/lib/comments";
import {
  postCommentAction,
  editCommentAction,
  deleteCommentAction,
  likeCommentAction,
  pinCommentAction,
  heartCommentAction,
} from "@/app/(video)/actions";

type Result = { ok: true; comments: CommentDTO[] } | { ok: false; error: string };

function countAll(list: CommentDTO[]): number {
  return list.reduce((n, c) => n + 1 + c.replies.length, 0);
}

const textareaClass =
  "w-full resize-none rounded-lg border border-glass-border bg-bg-0/40 px-3 py-2 text-sm text-text-hi outline-none transition-colors focus:border-accent/60";

/**
 * Threaded video comments (one level of replies, YouTube-style). Every mutation
 * returns the freshly rebuilt thread, so the UI simply swaps its state. Anonymous
 * viewers are routed to sign-in for any write.
 */
export function Comments({
  fileId,
  initial,
  viewerId,
  viewerHasAvatar,
  viewerName,
  isOwner,
  loginHref,
}: {
  fileId: string;
  initial: CommentDTO[];
  viewerId: string | null;
  viewerHasAvatar: boolean;
  viewerName: string;
  isOwner: boolean;
  loginHref: string;
}) {
  const [comments, setComments] = useState(initial);
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);

  const run = (action: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await action();
      if (res.ok) {
        setComments(res.comments);
        after?.();
      } else {
        toast.error(res.error);
      }
    });

  function submit() {
    const value = body.trim();
    if (!value) return;
    run(() => postCommentAction({ fileId, body: value }), () => {
      setBody("");
      setFocused(false);
    });
  }

  const total = countAll(comments);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-hi">
        <MessageCircle size={18} className="text-accent" aria-hidden />
        <span className="tabular">{formatCount(total)}</span> {total <= 1 ? "commentaire" : "commentaires"}
      </h2>

      {/* Composer */}
      {viewerId ? (
        <div className="flex gap-3">
          <Avatar userId={viewerId} name={viewerName || "Moi"} hasAvatar={viewerHasAvatar} size={40} />
          <div className="min-w-0 flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Ajouter un commentaire…"
              rows={focused || body ? 3 : 1}
              maxLength={2000}
              className={textareaClass}
            />
            {(focused || body) && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBody("");
                    setFocused(false);
                  }}
                  disabled={pending}
                >
                  Annuler
                </Button>
                <Button size="sm" onClick={submit} loading={pending} disabled={!body.trim()}>
                  Commenter
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
          <p className="text-sm text-text-lo">Connectez-vous pour rejoindre la conversation.</p>
          <Link href={loginHref} className={buttonClass({ variant: "primary", size: "sm" })}>
            Se connecter
          </Link>
        </div>
      )}

      {/* Thread */}
      <div className="flex flex-col gap-5">
        {comments.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            threadId={c.id}
            depth={0}
            fileId={fileId}
            viewerId={viewerId}
            isOwner={isOwner}
            loginHref={loginHref}
            pending={pending}
            run={run}
          />
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-text-faint">Soyez le premier à commenter.</p>
        )}
      </div>
    </section>
  );
}

function CommentNode({
  comment,
  threadId,
  depth,
  fileId,
  viewerId,
  isOwner,
  loginHref,
  pending,
  run,
}: {
  comment: CommentDTO;
  threadId: string;
  depth: number;
  fileId: string;
  viewerId: string | null;
  isOwner: boolean;
  loginHref: string;
  pending: boolean;
  run: (action: () => Promise<Result>, after?: () => void) => void;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [showReplies, setShowReplies] = useState(false);

  const avatarSize = depth === 0 ? 40 : 32;
  const channelHref = `/channel/${comment.authorHandle ?? comment.authorId}`;
  const canModerate = comment.mine || isOwner;

  function like() {
    if (!viewerId) {
      router.push(loginHref);
      return;
    }
    run(() => likeCommentAction({ commentId: comment.id }));
  }

  function submitReply() {
    const value = replyBody.trim();
    if (!value) return;
    run(() => postCommentAction({ fileId, body: value, parentId: threadId }), () => {
      setReplyBody("");
      setReplying(false);
      setShowReplies(true);
    });
  }

  function submitEdit() {
    const value = editBody.trim();
    if (!value) return;
    run(() => editCommentAction({ commentId: comment.id, body: value }), () => setEditing(false));
  }

  function remove() {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    run(() => deleteCommentAction({ commentId: comment.id }));
  }

  return (
    <div className="flex gap-3">
      <Avatar
        userId={comment.authorId}
        name={comment.authorName}
        hasAvatar={comment.authorHasAvatar}
        size={avatarSize}
        href={channelHref}
      />
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={channelHref} className="text-sm font-medium text-text-hi hover:text-accent">
            {comment.authorName}
          </Link>
          {comment.authorHandle && (
            <span className="text-xs text-text-faint">@{comment.authorHandle}</span>
          )}
          <span className="text-xs text-text-faint">· {formatRelative(comment.createdAt)}</span>
          {comment.edited && <span className="text-xs text-text-faint">(modifié)</span>}
          {comment.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-medium text-accent">
              <Pin size={10} aria-hidden /> Épinglé
            </span>
          )}
          {comment.heartedByOwner && (
            <Heart size={13} className="fill-danger text-danger" aria-label="Aimé par le créateur" />
          )}
        </div>

        {/* Body / edit */}
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              maxLength={2000}
              autoFocus
              className={textareaClass}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
                Annuler
              </Button>
              <Button size="sm" onClick={submitEdit} loading={pending} disabled={!editBody.trim()}>
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-hi">{comment.body}</p>
        )}

        {/* Actions */}
        {!editing && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-text-faint">
            <button
              onClick={like}
              disabled={pending}
              aria-pressed={comment.likedByMe}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors hover:bg-glass",
                comment.likedByMe ? "text-accent" : "text-text-lo",
              )}
            >
              <ThumbsUp size={14} className={cn(comment.likedByMe && "fill-current")} aria-hidden />
              {comment.likeCount > 0 && <span className="tabular">{formatCount(comment.likeCount)}</span>}
            </button>
            {viewerId && (
              <button
                onClick={() => setReplying((v) => !v)}
                className="rounded-full px-2 py-1 text-xs font-medium text-text-lo transition-colors hover:bg-glass hover:text-text-hi"
              >
                Répondre
              </button>
            )}
            {comment.mine && (
              <button
                onClick={() => {
                  setEditBody(comment.body);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-lo transition-colors hover:bg-glass hover:text-text-hi"
              >
                <Pencil size={13} aria-hidden /> Modifier
              </button>
            )}
            {depth === 0 && isOwner && (
              <button
                onClick={() => run(() => pinCommentAction({ commentId: comment.id, pinned: !comment.pinned }))}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-glass",
                  comment.pinned ? "text-accent" : "text-text-lo hover:text-text-hi",
                )}
              >
                <Pin size={13} aria-hidden /> {comment.pinned ? "Désépingler" : "Épingler"}
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => run(() => heartCommentAction({ commentId: comment.id, hearted: !comment.heartedByOwner }))}
                disabled={pending}
                aria-label="Aimer en tant que créateur"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-glass",
                  comment.heartedByOwner ? "text-danger" : "text-text-lo hover:text-text-hi",
                )}
              >
                <Heart size={13} className={cn(comment.heartedByOwner && "fill-current")} aria-hidden />
              </button>
            )}
            {canModerate && (
              <button
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-lo transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={13} aria-hidden /> Supprimer
              </button>
            )}
          </div>
        )}

        {/* Reply composer */}
        {replying && viewerId && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              placeholder="Répondre…"
              className={textareaClass}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReplying(false)} disabled={pending}>
                Annuler
              </Button>
              <Button size="sm" onClick={submitReply} loading={pending} disabled={!replyBody.trim()}>
                Répondre
              </Button>
            </div>
          </div>
        )}

        {/* Replies */}
        {comment.replies.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowReplies((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
            >
              {showReplies ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
              {comment.replies.length} {comment.replies.length <= 1 ? "réponse" : "réponses"}
            </button>
            {showReplies && (
              <div className="mt-2 flex flex-col gap-4 border-l border-glass-border pl-3 sm:pl-4">
                {comment.replies.map((r) => (
                  <CommentNode
                    key={r.id}
                    comment={r}
                    threadId={threadId}
                    depth={1}
                    fileId={fileId}
                    viewerId={viewerId}
                    isOwner={isOwner}
                    loginHref={loginHref}
                    pending={pending}
                    run={run}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
