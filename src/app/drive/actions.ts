"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/dal";
import { requireWrite, requireOwner } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  createFolder,
  renameItem,
  moveItem,
  deleteItem,
  toggleStar,
} from "@/lib/files";
import { createShare, revokeShare } from "@/lib/share";
import {
  grantPermission,
  revokePermission,
  getPermissionResource,
  listResourceGrants,
  type ResourceGrant,
} from "@/lib/permissions";
import {
  createFolderSchema,
  renameSchema,
  moveSchema,
  bulkDeleteSchema,
  bulkMoveSchema,
  createShareSchema,
  grantAccessSchema,
  fieldErrors,
} from "@/lib/validation";
import { serverEnv } from "@/lib/env";

/**
 * Drive mutations. Called directly from client components via `useTransition`
 * (not `useActionState`), so they take typed, serializable objects and return a
 * discriminated `{ ok }` result. EVERY action re-authenticates and re-checks
 * access through the DAL — the client capability is never trusted.
 */

type Ok<T = unknown> = { ok: true } & T;
type Fail = { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: string, fe?: Record<string, string>): Fail {
  return { ok: false, error, ...(fe ? { fieldErrors: fe } : {}) };
}

const revalidate = () => revalidatePath("/drive", "layout");

export async function createFolderAction(input: {
  name: string;
  parentId: string | null;
  color?: string | null;
}): Promise<Ok<{ id: string }> | Fail> {
  try {
    const user = await requireUser();
    const parsed = createFolderSchema.safeParse(input);
    if (!parsed.success) return fail("Nom invalide", fieldErrors(parsed.error));
    if (parsed.data.parentId) await requireWrite("FOLDER", parsed.data.parentId);
    const folder = await createFolder(user.id, {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      color: parsed.data.color ?? null,
    });
    revalidate();
    return { ok: true, id: folder.id };
  } catch (err) {
    return fail((err as Error).message || "Création impossible");
  }
}

export async function renameAction(input: {
  id: string;
  type: "FILE" | "FOLDER";
  name: string;
}): Promise<Ok | Fail> {
  try {
    await requireUser();
    const parsed = renameSchema.safeParse(input);
    if (!parsed.success) return fail("Nom invalide", fieldErrors(parsed.error));
    await requireWrite(parsed.data.type, parsed.data.id);
    await renameItem(parsed.data.type, parsed.data.id, parsed.data.name);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail((err as Error).message || "Renommage impossible");
  }
}

export async function moveAction(input: {
  id: string;
  type: "FILE" | "FOLDER";
  targetFolderId: string | null;
}): Promise<Ok | Fail> {
  try {
    await requireUser();
    const parsed = moveSchema.safeParse(input);
    if (!parsed.success) return fail("Destination invalide");
    await requireWrite(parsed.data.type, parsed.data.id);
    if (parsed.data.targetFolderId) await requireWrite("FOLDER", parsed.data.targetFolderId);
    await moveItem(parsed.data.type, parsed.data.id, parsed.data.targetFolderId);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail((err as Error).message || "Déplacement impossible");
  }
}

export async function deleteAction(input: {
  id: string;
  type: "FILE" | "FOLDER";
}): Promise<Ok | Fail> {
  try {
    await requireUser();
    await requireOwner(input.type, input.id);
    await deleteItem(input.type, input.id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail((err as Error).message || "Suppression impossible");
  }
}

/**
 * Bulk mutations iterate item by item and RE-CHECK access on each one — a mixed
 * selection where some items aren't owned silently skips those and reports how
 * many went through (never all-or-nothing on authz, matching drive UX).
 */
export async function bulkDeleteAction(input: {
  items: { id: string; type: "FILE" | "FOLDER" }[];
}): Promise<Ok<{ deleted: number; skipped: number }> | Fail> {
  try {
    await requireUser();
    const parsed = bulkDeleteSchema.safeParse(input);
    if (!parsed.success) return fail("Sélection invalide");
    let deleted = 0;
    for (const it of parsed.data.items) {
      try {
        await requireOwner(it.type, it.id);
        await deleteItem(it.type, it.id);
        deleted++;
      } catch {
        // Already gone (e.g. inside a folder deleted earlier in the loop) or
        // not owned — skip and keep going.
      }
    }
    revalidate();
    if (deleted === 0) return fail("Aucun élément supprimé");
    return { ok: true, deleted, skipped: parsed.data.items.length - deleted };
  } catch (err) {
    return fail((err as Error).message || "Suppression impossible");
  }
}

export async function bulkMoveAction(input: {
  items: { id: string; type: "FILE" | "FOLDER" }[];
  targetFolderId: string | null;
}): Promise<Ok<{ moved: number; skipped: number }> | Fail> {
  try {
    await requireUser();
    const parsed = bulkMoveSchema.safeParse(input);
    if (!parsed.success) return fail("Sélection invalide");
    if (parsed.data.targetFolderId) await requireWrite("FOLDER", parsed.data.targetFolderId);
    let moved = 0;
    for (const it of parsed.data.items) {
      try {
        await requireWrite(it.type, it.id);
        await moveItem(it.type, it.id, parsed.data.targetFolderId);
        moved++;
      } catch {
        // Not writable, or a folder moved into its own subtree — skip it.
      }
    }
    revalidate();
    if (moved === 0) return fail("Aucun élément déplacé");
    return { ok: true, moved, skipped: parsed.data.items.length - moved };
  } catch (err) {
    return fail((err as Error).message || "Déplacement impossible");
  }
}

export async function starAction(input: {
  fileId: string;
}): Promise<Ok<{ starred: boolean }> | Fail> {
  try {
    await requireUser();
    await requireWrite("FILE", input.fileId);
    const starred = await toggleStar(input.fileId);
    revalidate();
    return { ok: true, starred };
  } catch (err) {
    return fail((err as Error).message || "Action impossible");
  }
}

export async function createShareAction(input: {
  fileId?: string | null;
  folderId?: string | null;
  password?: string | null;
  expiresInDays?: number | null;
  maxDownloads?: number | null;
  allowUpload?: boolean;
  note?: string | null;
}): Promise<Ok<{ url: string; token: string }> | Fail> {
  try {
    const user = await requireUser();
    const parsed = createShareSchema.safeParse(input);
    if (!parsed.success) return fail("Configuration invalide", fieldErrors(parsed.error));
    const { fileId, folderId } = parsed.data;
    if ((!fileId && !folderId) || (fileId && folderId)) {
      return fail("Sélectionnez un fichier OU un dossier");
    }
    if (fileId) await requireOwner("FILE", fileId);
    if (folderId) await requireOwner("FOLDER", folderId);

    const { token } = await createShare({
      createdById: user.id,
      fileId: fileId ?? null,
      folderId: folderId ?? null,
      password: parsed.data.password ?? null,
      expiresInDays: parsed.data.expiresInDays ?? null,
      maxDownloads: parsed.data.maxDownloads ?? null,
      allowUpload: parsed.data.allowUpload ?? false,
      note: parsed.data.note ?? null,
    });

    const origin = serverEnv().APP_URL ?? `https://${(await headers()).get("host") ?? "localhost"}`;
    revalidatePath("/drive/shares");
    return { ok: true, token, url: `${origin.replace(/\/$/, "")}/s/${token}` };
  } catch (err) {
    return fail((err as Error).message || "Partage impossible");
  }
}

// ── Internal (member) sharing ────────────────────────────────────────────────

export async function grantAccessAction(input: {
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
  email: string;
  level: "READ" | "WRITE";
}): Promise<Ok<{ grants: ResourceGrant[] }> | Fail> {
  try {
    const user = await requireUser();
    const parsed = grantAccessSchema.safeParse(input);
    if (!parsed.success) return fail("Entrée invalide", fieldErrors(parsed.error));
    // Only the owner (or admin) may grant access to a resource.
    await requireOwner(parsed.data.resourceType, parsed.data.resourceId);
    await grantPermission({
      resourceType: parsed.data.resourceType,
      resourceId: parsed.data.resourceId,
      granteeEmail: parsed.data.email,
      level: parsed.data.level,
      grantedById: user.id,
    });
    const grants = await listResourceGrants(parsed.data.resourceType, parsed.data.resourceId);
    revalidatePath("/drive/shared");
    return { ok: true, grants };
  } catch (err) {
    return fail((err as Error).message || "Partage impossible");
  }
}

export async function listGrantsAction(input: {
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
}): Promise<Ok<{ grants: ResourceGrant[] }> | Fail> {
  try {
    await requireOwner(input.resourceType, input.resourceId);
    const grants = await listResourceGrants(input.resourceType, input.resourceId);
    return { ok: true, grants };
  } catch (err) {
    return fail((err as Error).message || "Chargement impossible");
  }
}

export async function revokeAccessAction(input: {
  permissionId: string;
}): Promise<Ok<{ grants: ResourceGrant[] }> | Fail> {
  try {
    await requireUser();
    const resource = await getPermissionResource(input.permissionId);
    if (!resource) return fail("Autorisation introuvable");
    // The resource owner (or admin) controls its grants.
    await requireOwner(resource.resourceType, resource.resourceId);
    await revokePermission(input.permissionId);
    const grants = await listResourceGrants(resource.resourceType, resource.resourceId);
    revalidatePath("/drive/shared");
    return { ok: true, grants };
  } catch (err) {
    return fail((err as Error).message || "Révocation impossible");
  }
}

export interface MoveTarget {
  id: string;
  name: string;
  path: string;
}

/** Every folder the user owns, for the move-destination picker. */
export async function moveTargetsAction(): Promise<MoveTarget[]> {
  const user = await requireUser();
  return prisma.folder.findMany({
    where: { ownerId: user.id },
    orderBy: { path: "asc" },
    select: { id: true, name: true, path: true },
  });
}

export async function revokeShareAction(input: {
  shareId: string;
}): Promise<Ok | Fail> {
  try {
    const user = await requireUser();
    const owned = await prisma.share.findFirst({
      where: { id: input.shareId, createdById: user.id },
      select: { id: true },
    });
    if (!owned) return fail("Partage introuvable");
    await revokeShare(input.shareId);
    revalidatePath("/drive/shares");
    return { ok: true };
  } catch (err) {
    return fail((err as Error).message || "Révocation impossible");
  }
}
