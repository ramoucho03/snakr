import "server-only";
import { promises as fs } from "node:fs";
import { prisma } from "./db";
import { storage, blobKey } from "./storage";
import { classifyFile } from "./mime";
import { generateDerivatives } from "./derivatives";
import { tooLarge, badRequest } from "./errors";

/**
 * Turn a completed tus upload (bytes already on disk) into a logical File:
 * sniff → content-address (sha256) → dedup → create row → reconcile quota →
 * enqueue derivatives. Streaming throughout: a multi-GB upload is hashed and
 * moved, never buffered.
 */

/** Enforce quota BEFORE bytes flow (called from tus onUploadCreate). */
export async function assertQuota(ownerId: string, additionalBytes: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { storageUsed: true, storageLimit: true },
  });
  if (!user) throw badRequest("Utilisateur introuvable");
  if (user.storageLimit == null) return; // unlimited
  if (BigInt(Math.ceil(additionalBytes)) + user.storageUsed > user.storageLimit) {
    throw tooLarge();
  }
}

export interface FinalizeArgs {
  ownerId: string;
  folderId: string | null;
  filename: string;
  /** Absolute path where the tus datastore wrote the finished bytes. */
  tusAbsPath: string;
}

export interface FinalizeResult {
  fileId: string;
  blobHash: string;
  size: number;
  deduped: boolean;
}

export async function finalizeUpload(args: FinalizeArgs): Promise<FinalizeResult> {
  const disk = storage();

  // 1. Validate by magic bytes (not the client's claimed type). Reject → clean up.
  const classified = await classifyFile(args.tusAbsPath, args.filename);
  if (!classified) {
    await fs.rm(args.tusAbsPath, { force: true }).catch(() => {});
    throw badRequest("Type de fichier non autorisé");
  }

  // 2. Content-address.
  const { hash, size } = await disk.hashFile(args.tusAbsPath);

  // 3. FINAL quota authority. The create-time pre-flight can be skated past via
  //    the tus deferred-length path (no Upload-Length ⇒ assertQuota(0) passes),
  //    so re-check against the ACTUAL hashed size and reject before committing.
  const owner = await prisma.user.findUnique({
    where: { id: args.ownerId },
    select: { storageUsed: true, storageLimit: true },
  });
  if (owner?.storageLimit != null && BigInt(size) + owner.storageUsed > owner.storageLimit) {
    await fs.rm(args.tusAbsPath, { force: true }).catch(() => {});
    throw tooLarge();
  }

  const key = blobKey(hash);
  const alreadyStored = await disk.exists(key);

  // 4. New content moves into place now. For a dedup hit we KEEP the temp file
  //    as a safety copy until the File row commits: a concurrent delete of the
  //    last reference could GC these bytes between our exists() check and our
  //    upsert, and the retained copy lets us restore them (step 6).
  if (!alreadyStored) {
    await disk.moveInto(args.tusAbsPath, key);
  }

  // 5. Blob upsert (ref-count), File create, quota reconcile — one transaction.
  const file = await prisma.$transaction(async (tx) => {
    await tx.blob.upsert({
      where: { hash },
      create: { hash, size: BigInt(size), mimeType: classified.mime, refCount: 1 },
      update: { refCount: { increment: 1 } },
    });
    const created = await tx.file.create({
      data: {
        name: args.filename,
        ownerId: args.ownerId,
        folderId: args.folderId,
        blobHash: hash,
      },
      select: { id: true },
    });
    await tx.user.update({
      where: { id: args.ownerId },
      data: { storageUsed: { increment: BigInt(size) } },
    });
    return created;
  });

  // 6. Reconcile the retained temp for the dedup path. Our File now holds a
  //    reference (refCount ≥ 1) so the bytes are safe from further GC — but if a
  //    concurrent delete already removed them, restore from the temp copy.
  if (alreadyStored) {
    if (await disk.exists(key)) {
      await fs.rm(args.tusAbsPath, { force: true }).catch(() => {});
    } else {
      await disk.moveInto(args.tusAbsPath, key);
    }
  }

  // 7. Derivatives, fire-and-forget (only for genuinely new content).
  if (!alreadyStored) void generateDerivatives(hash);

  return { fileId: file.id, blobHash: hash, size, deduped: alreadyStored };
}
