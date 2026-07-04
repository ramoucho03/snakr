import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "./env";

const ALG = "HS256";

function key(): Uint8Array {
  return new TextEncoder().encode(serverEnv().SESSION_SECRET);
}

export interface SessionClaims {
  sid: string; // Session.id (opaque, DB-backed)
}

/** Sign the (opaque) session id into a compact JWT for the cookie. */
export async function sealSession(sid: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
}

/** Verify & decode a session cookie; null on any failure. */
export async function openSession(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    return typeof payload.sid === "string" ? { sid: payload.sid } : null;
  } catch {
    return null;
  }
}
