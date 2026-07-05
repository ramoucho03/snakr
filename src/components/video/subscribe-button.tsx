"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { subscribeAction } from "@/app/(video)/actions";

/**
 * Subscribe / subscribed toggle. Optimistic; reverts on failure. When the viewer
 * isn't signed in (`canSubscribe` false) it routes to login instead. Hidden for
 * the channel owner (handled by callers via `isOwner`).
 */
export function SubscribeButton({
  channelId,
  initialSubscribed,
  canSubscribe = true,
  size = "md",
}: {
  channelId: string;
  initialSubscribed: boolean;
  canSubscribe?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, start] = useTransition();

  function onClick() {
    if (!canSubscribe) {
      router.push(`/login?next=${encodeURIComponent(`/channel/${channelId}`)}`);
      return;
    }
    const optimistic = !subscribed;
    setSubscribed(optimistic);
    start(async () => {
      const res = await subscribeAction({ channelId });
      if (!res.ok) {
        setSubscribed(!optimistic);
        toast.error(res.error);
      } else {
        setSubscribed(res.state.subscribed);
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-pressed={subscribed}
      className={cn(
        buttonClass({ variant: subscribed ? "secondary" : "primary", size: size === "sm" ? "sm" : "md" }),
        "rounded-full",
      )}
    >
      {subscribed ? (
        <>
          <Check size={size === "sm" ? 15 : 16} aria-hidden /> Abonné
        </>
      ) : (
        <>
          <Bell size={size === "sm" ? 15 : 16} aria-hidden /> S'abonner
        </>
      )}
    </button>
  );
}
