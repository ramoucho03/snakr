import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { $Enums } from "@prisma/client";
import { prisma } from "./db";
import { openSession } from "./session";
import { SESSION_COOKIE } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  role: $Enums.Role;
  displayName: string | null;
  storageLimit: bigint | null;
  storageUsed: bigint;
  mustChangePw: boolean;
  avatarKey: string | null;
  handle: string | null;
}

/**
 * The security boundary. Memoized per request via React `cache` so repeated
 * calls in one render pass hit the DB once. Returns null when unauthenticated —
 * NEVER throws, so callers decide the response (401 vs redirect vs hide UI).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await openSession(token);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          displayName: true,
          storageLimit: true,
          storageUsed: true,
          mustChangePw: true,
          isSuspended: true,
          avatarKey: true,
          handle: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.isSuspended) return null;

  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    displayName: u.displayName,
    storageLimit: u.storageLimit,
    storageUsed: u.storageUsed,
    mustChangePw: u.mustChangePw,
    avatarKey: u.avatarKey,
    handle: u.handle,
  };
});

/** Require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin or redirect (403-equivalent) to the drive. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/drive");
  return user;
}
