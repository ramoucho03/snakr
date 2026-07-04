import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./auth";

/**
 * Public share links. The raw token (256 bits of CSPRNG) is shown to the
 * creator exactly once; only its sha256 is stored, so a DB leak cannot be
 * replayed into working links. Optional password is argon2id-hashed. The
 * download counter is enforced with an atomic conditional UPDATE to kill the
 * check-then-increment race.
 */

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CreateShareArgs {
  createdById: string;
  fileId?: string | null;
  folderId?: string | null;
  password?: string | null;
  expiresInDays?: number | null;
  maxDownloads?: number | null;
  allowUpload?: boolean;
  note?: string | null;
}

/** Create a share and return the one-time token (never persisted in the clear). */
export async function createShare(
  args: CreateShareArgs,
): Promise<{ id: string; token: string }> {
  const token = generateToken();
  const expiresAt =
    args.expiresInDays && args.expiresInDays > 0
      ? new Date(Date.now() + args.expiresInDays * 86_400_000)
      : null;

  const share = await prisma.share.create({
    data: {
      createdById: args.createdById,
      fileId: args.fileId ?? null,
      folderId: args.folderId ?? null,
      tokenHash: hashToken(token),
      passwordHash: args.password ? await hashPassword(args.password) : null,
      expiresAt,
      maxDownloads: args.maxDownloads ?? null,
      allowUpload: args.allowUpload ?? false,
      note: args.note ?? null,
    },
    select: { id: true },
  });

  return { id: share.id, token };
}

export type ShareState =
  | { status: "invalid" }
  | { status: "revoked" }
  | { status: "expired" }
  | { status: "exhausted" }
  | { status: "password" ; share: PublicShare }
  | { status: "ok"; share: PublicShare };

export interface PublicShare {
  id: string;
  fileId: string | null;
  folderId: string | null;
  note: string | null;
  allowUpload: boolean;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  file: { id: string; name: string; size: number; mime: string } | null;
  folder: { id: string; name: string } | null;
}

/**
 * Resolve a token to its share, reporting exactly why it is unusable. When a
 * password is set and `password` is not (yet) provided/valid, returns
 * `status:"password"` so the caller can render the unlock gate.
 */
export async function resolveShare(
  token: string,
  password?: string | null,
): Promise<ShareState> {
  const share = await prisma.share.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      fileId: true,
      folderId: true,
      note: true,
      allowUpload: true,
      passwordHash: true,
      maxDownloads: true,
      downloadCount: true,
      revokedAt: true,
      expiresAt: true,
      file: { select: { id: true, name: true, blob: { select: { size: true, mimeType: true } } } },
      folder: { select: { id: true, name: true } },
    },
  });

  if (!share) return { status: "invalid" };
  if (share.revokedAt) return { status: "revoked" };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { status: "expired" };
  if (share.maxDownloads != null && share.downloadCount >= share.maxDownloads) {
    return { status: "exhausted" };
  }

  const pub: PublicShare = {
    id: share.id,
    fileId: share.fileId,
    folderId: share.folderId,
    note: share.note,
    allowUpload: share.allowUpload,
    hasPassword: Boolean(share.passwordHash),
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount,
    file: share.file
      ? {
          id: share.file.id,
          name: share.file.name,
          size: Number(share.file.blob.size),
          mime: share.file.blob.mimeType,
        }
      : null,
    folder: share.folder ? { id: share.folder.id, name: share.folder.name } : null,
  };

  if (share.passwordHash) {
    if (!password) return { status: "password", share: pub };
    const ok = await verifyPassword(share.passwordHash, password);
    if (!ok) return { status: "password", share: pub };
  }

  return { status: "ok", share: pub };
}

/**
 * Atomically claim one download against `maxDownloads`. Returns false when the
 * limit was already hit (0 rows updated) — the race-proof gate before serving
 * bytes. Unlimited shares always succeed.
 */
export async function claimDownload(shareId: string): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "Share"
    SET "downloadCount" = "downloadCount" + 1
    WHERE id = ${shareId}
      AND "revokedAt" IS NULL
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
      AND ("maxDownloads" IS NULL OR "downloadCount" < "maxDownloads")`;
  return updated > 0;
}

export async function revokeShare(shareId: string): Promise<void> {
  await prisma.share.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

export async function listSharesFor(userId: string) {
  return prisma.share.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      note: true,
      expiresAt: true,
      maxDownloads: true,
      downloadCount: true,
      revokedAt: true,
      createdAt: true,
      file: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
    },
  });
}
