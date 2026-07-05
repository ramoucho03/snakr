import "server-only";
import { prisma } from "./db";

export interface EditableProfile {
  displayName: string;
  handle: string | null;
  bio: string | null;
  accentColor: string | null;
  hasAvatar: boolean;
  hasBanner: boolean;
  email: string;
}

export async function getEditableProfile(userId: string): Promise<EditableProfile | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      email: true,
      handle: true,
      bio: true,
      accentColor: true,
      avatarKey: true,
      bannerKey: true,
    },
  });
  if (!u) return null;
  return {
    displayName: u.displayName ?? "",
    handle: u.handle,
    bio: u.bio,
    accentColor: u.accentColor,
    hasAvatar: u.avatarKey != null,
    hasBanner: u.bannerKey != null,
    email: u.email,
  };
}

const HANDLE_RE = /^[a-z0-9_.]{3,24}$/;

/** Normalize a raw handle input ("@Foo_Bar" → "foo_bar"); null clears it. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  return h.length ? h : null;
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

/** True when `handle` is free (or already owned by `exceptUserId`). */
export async function handleAvailable(
  handle: string,
  exceptUserId: string,
): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { handle },
    select: { id: true },
  });
  return !existing || existing.id === exceptUserId;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export function isValidHex(color: string): boolean {
  return HEX_RE.test(color);
}
