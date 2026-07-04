import "server-only";
import type { $Enums } from "@prisma/client";
import { prisma } from "./db";
import { getCurrentUser, type SessionUser } from "./dal";
import { forbidden, notFound, unauthorized } from "./errors";

/**
 * The authorization core. Effective access to a resource is the MOST-PERMISSIVE
 * of: ownership, ADMIN role, a direct ACL grant, or an inherited grant on any
 * ancestor folder (resolved from the materialized `Folder.path`), including
 * grants to the user's groups. Owner and ADMIN short-circuit. This runs
 * server-side on every read/write — never trust a capability sent by the client.
 */

type Level = $Enums.AccessLevel; // "READ" | "WRITE" | "OWNER"
type ResourceType = $Enums.ResourceType; // "FILE" | "FOLDER"

const RANK: Record<Level, number> = { READ: 1, WRITE: 2, OWNER: 3 };

function strongest(levels: Level[]): Level | null {
  let best: Level | null = null;
  for (const l of levels) if (!best || RANK[l] > RANK[best]) best = l;
  return best;
}

/** Ancestor folder ids encoded in a materialized path like `/rootId/childId/`. */
function ancestorsFromPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** The set of folder ids whose grants inherit down to this resource. */
async function inheritanceChain(
  type: ResourceType,
  id: string,
): Promise<{ ownerId: string; folderIds: string[] } | null> {
  if (type === "FOLDER") {
    const f = await prisma.folder.findUnique({
      where: { id },
      select: { ownerId: true, path: true },
    });
    if (!f) return null;
    return { ownerId: f.ownerId, folderIds: [...ancestorsFromPath(f.path), id] };
  }
  const file = await prisma.file.findUnique({
    where: { id },
    select: { ownerId: true, folderId: true, folder: { select: { path: true } } },
  });
  if (!file) return null;
  const folderIds = file.folderId
    ? [...ancestorsFromPath(file.folder?.path ?? "/"), file.folderId]
    : [];
  return { ownerId: file.ownerId, folderIds };
}

/** Effective level, or null when the user has no access at all. */
export async function effectiveLevel(
  user: SessionUser,
  type: ResourceType,
  id: string,
): Promise<Level | null> {
  if (user.role === "ADMIN") return "OWNER";

  const chain = await inheritanceChain(type, id);
  if (!chain) return null;
  if (chain.ownerId === user.id) return "OWNER";

  const groupIds = (
    await prisma.groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    })
  ).map((g) => g.groupId);

  const principalOr = [
    { principalType: "USER" as const, principalId: user.id },
    ...(groupIds.length
      ? [{ principalType: "GROUP" as const, principalId: { in: groupIds } }]
      : []),
  ];

  const resourceOr = [
    { resourceType: type, resourceId: id },
    ...(chain.folderIds.length
      ? [{ resourceType: "FOLDER" as const, resourceId: { in: chain.folderIds } }]
      : []),
  ];

  const grants = await prisma.permission.findMany({
    where: { AND: [{ OR: resourceOr }, { OR: principalOr }] },
    select: { level: true },
  });

  return grants.length ? strongest(grants.map((g) => g.level)) : null;
}

export interface AccessContext {
  user: SessionUser;
  level: Level;
}

/** Require an authed user with at least READ on the resource (throws otherwise). */
export async function requireRead(type: ResourceType, id: string): Promise<AccessContext> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  const level = await effectiveLevel(user, type, id);
  if (!level) {
    // Distinguish "not there" from "not yours" only to owners/admins would leak
    // existence; return 404 to everyone without access.
    throw notFound();
  }
  return { user, level };
}

/** Require WRITE (or OWNER). Read-only sharees are rejected. */
export async function requireWrite(type: ResourceType, id: string): Promise<AccessContext> {
  const ctx = await requireRead(type, id);
  if (RANK[ctx.level] < RANK.WRITE) throw forbidden();
  return ctx;
}

/** Require OWNER (or ADMIN) — for destructive/ownership ops like sharing. */
export async function requireOwner(type: ResourceType, id: string): Promise<AccessContext> {
  const ctx = await requireRead(type, id);
  if (RANK[ctx.level] < RANK.OWNER) throw forbidden();
  return ctx;
}

export { RANK as ACCESS_RANK };
