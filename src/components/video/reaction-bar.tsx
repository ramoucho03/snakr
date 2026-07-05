"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn, formatCount } from "@/lib/utils";
import { reactAction } from "@/app/(video)/actions";

type Kind = "LIKE" | "DISLIKE";
export interface ReactionState {
  likes: number;
  dislikes: number;
  mine: Kind | null;
}

/**
 * A YouTube-style segmented like / dislike pill. Optimistic, reverting on error.
 * Anonymous viewers are routed to sign-in instead of mutating.
 */
export function ReactionBar({
  fileId,
  initial,
  canReact,
  loginHref,
}: {
  fileId: string;
  initial: ReactionState;
  canReact: boolean;
  loginHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ReactionState>(initial);
  const [pending, start] = useTransition();

  function react(kind: Kind) {
    if (!canReact) {
      router.push(loginHref);
      return;
    }
    // Optimistic recompute.
    const wasMine = state.mine;
    const next: ReactionState = {
      likes: state.likes - (wasMine === "LIKE" ? 1 : 0) + (kind === "LIKE" && wasMine !== "LIKE" ? 1 : 0),
      dislikes:
        state.dislikes - (wasMine === "DISLIKE" ? 1 : 0) + (kind === "DISLIKE" && wasMine !== "DISLIKE" ? 1 : 0),
      mine: wasMine === kind ? null : kind,
    };
    setState(next);
    start(async () => {
      const res = await reactAction({ fileId, kind });
      if (!res.ok) {
        setState(state);
        toast.error(res.error);
      } else {
        setState(res.summary);
      }
    });
  }

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-full glass">
      <button
        onClick={() => react("LIKE")}
        disabled={pending}
        aria-pressed={state.mine === "LIKE"}
        className={cn(
          "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-glass-strong",
          state.mine === "LIKE" ? "text-accent" : "text-text-hi",
        )}
      >
        <ThumbsUp size={17} className={cn(state.mine === "LIKE" && "fill-current")} aria-hidden />
        <span className="tabular">{formatCount(state.likes)}</span>
      </button>
      <span className="my-1.5 w-px bg-glass-border" aria-hidden />
      <button
        onClick={() => react("DISLIKE")}
        disabled={pending}
        aria-pressed={state.mine === "DISLIKE"}
        aria-label="Je n'aime pas"
        className={cn(
          "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-glass-strong",
          state.mine === "DISLIKE" ? "text-danger" : "text-text-hi",
        )}
      >
        <ThumbsDown size={17} className={cn(state.mine === "DISLIKE" && "fill-current")} aria-hidden />
        {state.dislikes > 0 && <span className="tabular">{formatCount(state.dislikes)}</span>}
      </button>
    </div>
  );
}
