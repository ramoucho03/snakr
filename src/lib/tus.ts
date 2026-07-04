import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "node:fs";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { tusUploadDir } from "./storage";
import { assertQuota, finalizeUpload } from "./upload-finalize";
import { prisma } from "./db";
import { statusOf } from "./errors";

/**
 * tus server wiring. The authenticated user is carried through `handleWeb` via
 * AsyncLocalStorage — the browser is never trusted for ownerId; only the folder
 * target rides in client metadata, and even that is re-checked for ownership.
 * Quota is enforced in `onUploadCreate` (before bytes flow); content-addressing,
 * dedup and the File row happen in `onUploadFinish`.
 */

interface UploadCtx {
  userId: string;
}
const als = new AsyncLocalStorage<UploadCtx>();

export function runWithUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ userId }, fn);
}

function requireCtx(): UploadCtx {
  const ctx = als.getStore();
  if (!ctx) throw new Error("tus handler invoked outside a user context");
  return ctx;
}

/** Shape tus expects on a thrown rejection (aborts the request with this). */
function tusError(err: unknown): { status_code: number; body: string } {
  return { status_code: statusOf(err), body: (err as Error).message ?? "Upload refusé" };
}

let server: Server | null = null;

export function tusServer(): Server {
  if (server) return server;
  server = new Server({
    path: "/api/upload",
    datastore: new FileStore({ directory: tusUploadDir() }),
    respectForwardedHeaders: true,

    // Hard cap on the bytes a PATCH may stream, = the user's remaining quota.
    // This defends the deferred-length path (`Upload-Defer-Length: 1`) where no
    // `Upload-Length` is declared at create time, so `onUploadCreate` can't gate
    // it. `0` means unlimited (matches tus semantics) for uncapped accounts.
    async maxSize() {
      const { userId } = requireCtx();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { storageUsed: true, storageLimit: true },
      });
      if (!user || user.storageLimit == null) return 0; // unlimited
      const remaining = Number(user.storageLimit - user.storageUsed);
      return remaining > 0 ? remaining : 1; // never 0 (that would mean unlimited)
    },

    async onUploadCreate(_req, upload) {
      const { userId } = requireCtx();
      try {
        await assertQuota(userId, upload.size ?? 0);
      } catch (err) {
        throw tusError(err);
      }
      const folderId = upload.metadata?.folderId || null;
      if (folderId) {
        const owned = await prisma.folder.findFirst({
          where: { id: folderId, ownerId: userId },
          select: { id: true },
        });
        if (!owned) throw { status_code: 400, body: "Dossier de destination invalide" };
      }
      return {};
    },

    async onUploadFinish(_req, upload) {
      const { userId } = requireCtx();
      const dataPath = upload.storage?.path;
      if (!dataPath) throw { status_code: 500, body: "Upload incomplet" };

      const filename =
        upload.metadata?.name || upload.metadata?.filename || "fichier";
      const folderId = upload.metadata?.folderId || null;

      try {
        const result = await finalizeUpload({
          ownerId: userId,
          folderId,
          filename,
          tusAbsPath: dataPath,
        });
        // Drop the tus metadata sidecar; the data file was moved/removed already.
        await fs.rm(`${dataPath}.json`, { force: true }).catch(() => {});
        return {
          status_code: 200,
          headers: { "X-File-Id": result.fileId },
          body: JSON.stringify({ fileId: result.fileId, deduped: result.deduped }),
        };
      } catch (err) {
        throw tusError(err);
      }
    },
  });
  return server;
}
