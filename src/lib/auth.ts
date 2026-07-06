import "server-only";
import { cookies } from "next/headers";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { prisma } from "./db";
import { openSession, sealSession } from "./session";
import { cookieSecure } from "./env";

export const SESSION_COOKIE = "snakr_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// OWASP argon2id floor. Bump memoryCost on capable hosts.
const ARGON_OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argonVerify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Create a DB-backed session and set the encrypted cookie. */
export async function createSession(
  userId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });
  const token = await sealSession(session.id, expiresAt);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return session;
}

/** Delete the current session row (instant revoke) and clear the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const claims = await openSession(token);
  if (claims) {
    await prisma.session.deleteMany({ where: { id: claims.sid } });
  }
  store.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (e.g. on suspend / password change). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
