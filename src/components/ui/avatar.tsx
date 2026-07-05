"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";

/**
 * A member avatar: the uploaded image when present, a tinted initials disc
 * otherwise. Falls back to initials if the image fails to load. Optionally links
 * to the member's channel.
 */
export function Avatar({
  userId,
  name,
  hasAvatar,
  size = 40,
  href,
  className,
  ring,
}: {
  userId: string;
  name: string;
  hasAvatar?: boolean;
  size?: number;
  href?: string;
  className?: string;
  ring?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = hasAvatar && !broken;

  const inner = showImg ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/users/${userId}/avatar`}
      alt={name}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  ) : (
    <span
      className="grid h-full w-full place-items-center font-semibold text-text-hi"
      style={{ fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );

  const classes = cn(
    "relative shrink-0 overflow-hidden rounded-full bg-glass-strong",
    ring && "ring-1 ring-glass-border",
    className,
  );
  const style = { width: size, height: size };

  if (href) {
    return (
      <Link href={href} className={cn(classes, "transition-transform hover:scale-105")} style={style} aria-label={name}>
        {inner}
      </Link>
    );
  }
  return (
    <span className={classes} style={style}>
      {inner}
    </span>
  );
}
