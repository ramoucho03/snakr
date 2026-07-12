import "server-only";
import { prisma } from "./db";
import { storage, blobKey } from "./storage";
import { previewKindOf, type PreviewKind } from "./mime";
import { badRequest } from "./errors";

/**
 * Server-only data functions for the logical file tree. Physical bytes are
 * touched only through the storage provider; quota (`User.storageUsed`) and blob
 * reference counts are reconciled here on every create/delete so they never
 * drift. Callers are responsible for the authz check (see access.ts) BEFORE
 * calling any mutating function — these trust their inputs.
 */

export interface FolderDTO {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
  fileCount: number;
  subfolderCount: number;
}

export interface FileDTO {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: PreviewKind;
  starred: boolean;
  hasThumb: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

/** Path a NEW child folder should carry, given its parent (null = root). */
async function childPathFor(parentId: string | null): Promise<string> {
  if (!parentId) return "/";
  const parent = await prisma.folder.findUnique({
    where: { id: parentId },
    select: { path: true, id: true },
  });
  if (!parent) throw badRequest("Dossier parent introuvable");
  return `${parent.path}${parent.id}/`;
}

export async function listFolder(
  ownerId: string,
  folderId: string | null,
): Promise<{ folders: FolderDTO[]; files: FileDTO[] }> {
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId, parentId: folderId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
        _count: { select: { files: true, children: true } },
      },
    }),
    prisma.file.findMany({
      where: { ownerId, folderId },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        starred: true,
        createdAt: true,
        updatedAt: true,
        blob: {
          select: {
            size: true,
            mimeType: true,
            derivatives: { where: { kind: "thumb" }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  return {
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      createdAt: f.createdAt,
      fileCount: f._count.files,
      subfolderCount: f._count.children,
    })),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: Number(f.blob.size),
      mime: f.blob.mimeType,
      kind: previewKindOf(f.blob.mimeType, f.name),
      starred: f.starred,
      hasThumb: f.blob.derivatives.length > 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  };
}

/** All starred files the user owns, most recently touched first (Favoris). */
export async function listStarredFiles(ownerId: string): Promise<FileDTO[]> {
  const files = await prisma.file.findMany({
    where: { ownerId, starred: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      starred: true,
      createdAt: true,
      updatedAt: true,
      blob: {
        select: {
          size: true,
          mimeType: true,
          derivatives: { where: { kind: "thumb" }, select: { id: true } },
        },
      },
    },
  });
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.blob.size),
    mime: f.blob.mimeType,
    kind: previewKindOf(f.blob.mimeType, f.name),
    starred: f.starred,
    hasThumb: f.blob.derivatives.length > 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

/** Root → current breadcrumbs for a folder id (empty at drive root). */
export async function breadcrumbs(folderId: string | null): Promise<Breadcrumb[]> {
  if (!folderId) return [];
  const current = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, path: true },
  });
  if (!current) return [];
  const ancestorIds = current.path.split("/").filter(Boolean);
  const ancestors = ancestorIds.length
    ? await prisma.folder.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(ancestors.map((a) => [a.id, a]));
  const ordered = ancestorIds
    .map((id) => byId.get(id))
    .filter((a): a is { id: string; name: string } => Boolean(a));
  return [...ordered, { id: current.id, name: current.name }];
}

export async function createFolder(
  ownerId: string,
  input: { name: string; parentId: string | null; color: string | null },
): Promise<{ id: string }> {
  const path = await childPathFor(input.parentId);
  const folder = await prisma.folder.create({
    data: {
      name: input.name,
      ownerId,
      parentId: input.parentId,
      color: input.color,
      path,
    },
    select: { id: true },
  });
  return folder;
}

export async function renameItem(
  type: "FILE" | "FOLDER",
  id: string,
  name: string,
): Promise<void> {
  if (type === "FILE") {
    await prisma.file.update({ where: { id }, data: { name } });
  } else {
    await prisma.folder.update({ where: { id }, data: { name } });
  }
}

export async function toggleStar(fileId: string): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { starred: true },
  });
  const next = !file?.starred;
  await prisma.file.update({ where: { id: fileId }, data: { starred: next } });
  return next;
}

/** Move a file or folder into a target folder (null = drive root). */
export async function moveItem(
  type: "FILE" | "FOLDER",
  id: string,
  targetFolderId: string | null,
): Promise<void> {
  if (type === "FILE") {
    await prisma.file.update({ where: { id }, data: { folderId: targetFolderId } });
    return;
  }

  // Folder move: reject cycles, then rewrite the materialized path of the
  // folder and every descendant in one transaction.
  const self = await prisma.folder.findUnique({
    where: { id },
    select: { id: true, path: true },
  });
  if (!self) throw badRequest("Dossier introuvable");

  const newParentPath = await childPathFor(targetFolderId);
  if (targetFolderId === id) throw badRequest("Déplacement invalide");
  // A descendant's path contains this folder's id — forbid moving into it.
  if (newParentPath.split("/").filter(Boolean).includes(id)) {
    throw badRequest("Impossible de déplacer un dossier dans lui-même");
  }

  const oldDescPrefix = `${self.path}${id}/`;
  const newDescPrefix = `${newParentPath}${id}/`;

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "Folder"
      SET path = ${newDescPrefix} || substring(path from ${oldDescPrefix.length + 1})
      WHERE path LIKE ${oldDescPrefix + "%"}`,
    prisma.folder.update({
      where: { id },
      data: { parentId: targetFolderId, path: newParentPath },
    }),
  ]);
}

/** Drop one File; garbage-collect its blob (+ physical bytes) when refCount hits 0. */
async function releaseFile(fileId: string): Promise<void> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      ownerId: true,
      blobHash: true,
      blob: {
        select: {
          size: true,
          // Read the derivative keys BEFORE the transaction: the rows cascade
          // away with the Blob, and without them we could never find the
          // thumbnail / poster / preview / faststart bytes again.
          derivatives: { select: { key: true } },
        },
      },
    },
  });
  if (!file) return;

  await prisma.$transaction(async (tx) => {
    await tx.file.delete({ where: { id: fileId } });
    const blob = await tx.blob.update({
      where: { hash: file.blobHash },
      data: { refCount: { decrement: 1 } },
      select: { refCount: true },
    });
    await tx.user.update({
      where: { id: file.ownerId },
      data: { storageUsed: { decrement: file.blob.size } },
    });
    if (blob.refCount <= 0) {
      // Derivatives cascade via FK; remove the blob row and enqueue byte cleanup.
      await tx.blob.delete({ where: { hash: file.blobHash } });
    }
  });

  // Physical cleanup outside the transaction (best-effort; row is already gone).
  const stillReferenced = await prisma.blob.findUnique({
    where: { hash: file.blobHash },
    select: { hash: true },
  });
  if (!stillReferenced) {
    const disk = storage();
    await Promise.all([
      disk.delete(blobKey(file.blobHash)).catch(() => {}),
      ...file.blob.derivatives.map((d) => disk.delete(d.key).catch(() => {})),
    ]);
  }
}

/** Recursively delete a folder subtree, releasing every file within it. */
export async function deleteItem(type: "FILE" | "FOLDER", id: string): Promise<void> {
  if (type === "FILE") {
    await releaseFile(id);
    return;
  }

  const self = await prisma.folder.findUnique({
    where: { id },
    select: { path: true },
  });
  if (!self) return;

  const descPrefix = `${self.path}${id}/`;
  const subfolders = await prisma.folder.findMany({
    where: { OR: [{ id }, { path: { startsWith: descPrefix } }] },
    select: { id: true },
  });
  const folderIds = subfolders.map((f) => f.id);

  const files = await prisma.file.findMany({
    where: { folderId: { in: folderIds } },
    select: { id: true },
  });
  for (const f of files) await releaseFile(f.id);

  // Children cascade via the self-relation onDelete: Cascade.
  await prisma.folder.delete({ where: { id } });
}

/** Full record for the download / preview routes. */
export async function getFileRecord(fileId: string) {
  return prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      folderId: true,
      blob: { select: { hash: true, size: true, mimeType: true } },
    },
  });
}

/**
 * Everything `/api/files/[id]` needs, in ONE query: the bytes to serve, the
 * columns that decide whether the caller may have them, and the derivatives it
 * can serve instead of the source.
 *
 * The byte route used to run `isPubliclyWatchable()` and then `getFileRecord()`.
 * Seeking a video fires a Range request per jump, so that was two round-trips to
 * Postgres for every scrub of every viewer.
 */
export async function getServableFile(fileId: string) {
  return prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      visibility: true,
      blob: {
        select: {
          hash: true,
          size: true,
          mimeType: true,
          derivatives: { select: { kind: true, key: true, size: true, mimeType: true } },
        },
      },
    },
  });
}

export async function storageSummary(
  userId: string,
): Promise<{ used: number; limit: number | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { storageUsed: true, storageLimit: true },
  });
  return {
    used: Number(u?.storageUsed ?? 0),
    limit: u?.storageLimit == null ? null : Number(u.storageLimit),
  };
}
