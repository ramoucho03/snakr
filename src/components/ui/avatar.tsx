"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";

/**
 * A member avatar: the uploaded image when present, a tinted initials disc
 * otherwise. Falls back to initials if the image fails to load. Optionally links
 * to the member's channel.
 *
 * Sizing is bulletproof by construction: the box is an `inline-block` with a
 * DEFINITE width/height (inline elements ignore width/height + overflow, and a
 * flex child <img> keeps `min-width:auto` and refuses to shrink — both let the
 * raw image blow out of the circle). The image is then ABSOLUTELY positioned to
 * fill that box, so any source resolution/aspect is cropped to a clean disc.
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
      onError={() => setBroken(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  ) : (
    <span
      className="absolute inset-0 grid place-items-center font-semibold text-text-hi"
      style={{ fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );

  const classes = cn(
    "relative inline-block shrink-0 overflow-hidden rounded-full bg-glass-strong align-middle",
    ring && "ring-1 ring-glass-border",
    className,
  );
  const style = { width: size, height: size };

  if (href) {
    return (
      <Link
        href={href}
        className={cn(classes, "transition-transform hover:scale-105")}
        style={style}
        aria-label={name}
      >
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
