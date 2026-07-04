import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "./env";

/**
 * Proof that a password-protected share was unlocked this session. The unlock
 * action verifies the password once and sets this signed grant as an httpOnly
 * cookie; the download route trusts the grant instead of re-prompting. Signed
 * with the app secret so it cannot be forged.
 */
export const SHARE_GRANT_COOKIE = "snakr_share_grant";
const ALG = "HS256";

const key = () => new TextEncoder().encode(serverEnv().SESSION_SECRET);

export async function signShareGrant(shareId: string): Promise<string> {
  return new SignJWT({ sid: shareId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(key());
}

export async function verifyShareGrant(
  token: string | undefined,
  shareId: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    return payload.sid === shareId;
  } catch {
    return false;
  }
}

/**
 * Signed "download in progress" marker. Set on the FIRST (byte-0) served request
 * for a share+file, and required to serve any continuation (Range start > 0).
 * This is what stops a crafted `Range: bytes=1-` from streaming content while
 * skipping the atomic `maxDownloads` claim, without breaking legitimate resume.
 */
export const DL_PROGRESS_COOKIE = "snakr_dl";

export async function signDownloadProgress(shareId: string, fileId: string): Promise<string> {
  return new SignJWT({ sid: shareId, fid: fileId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key());
}

export async function verifyDownloadProgress(
  token: string | undefined,
  shareId: string,
  fileId: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    return payload.sid === shareId && payload.fid === fileId;
  } catch {
    return false;
  }
}
