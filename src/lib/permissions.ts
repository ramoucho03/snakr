import "server-only";
import type { $Enums } from "@prisma/client";
import { prisma } from "./db";
import { previewKindOf, type PreviewKind } from "./mime";
import { badRequest } from "./errors";

/**
 * Internal (member-to-member) sharing: the ACL grant side of `access.ts`. A
 * resource owner grants another USER a READ or WRITE level on a file or folder;
 * the grant inherits down a folder tree during access resolution. Groups exist
 * in the schema but have no management UI yet, so we only handle USER principals.
 */

type ResourceType = $Enums.ResourceType;
type WriteLevel = "READ" | "WRITE";

export interface Grantee {
  id: string;
  email: string;
  displayName: string | null;
}

/** Grant (or update) a user's access to a resource. Returns the grantee. */
export async function grantPermission(args: {
  resourceType: ResourceType;
  resourceId: string;
  granteeEmail: string;
  level: WriteLevel;
  grantedById: string;
}): Promise<Grantee> {
  const grantee = await prisma.user.findUnique({
    where: { email: args.granteeEmail },
    select: { id: true, email: true, displayName: true, isSuspended: true },
  });
  if (!grantee) throw badRequest("Aucun utilisateur avec cette adresse");
  if (grantee.isSuspended) throw badRequest("Ce compte est suspendu");
  if (grantee.id === args.grantedById) throw badRequest("Vous êtes déjà propriétaire");

  await prisma.permission.upsert({
    where: {
      resourceType_resourceId_principalType_principalId: {
        resourceType: args.resourceType,
        resourceId: args.resourceId,
        principalType: "USER",
        principalId: grantee.id,
      },
    },
    create: {
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      principalType: "USER",
      principalId: grantee.id,
      level: args.level,
      grantedById: args.grantedById,
    },
    update: { level: args.level },
  });

  return { id: grantee.id, email: grantee.email, displayName: grantee.displayName };
}

export interface ResourceGrant {
  id: string;
  level: $Enums.AccessLevel;
  user: Grantee;
}

/** List the USER grants currently on a resource (for the manage-access panel). */
export async function listResourceGrants(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceGrant[]> {
  const grants = await prisma.permission.findMany({
    where: { resourceType, resourceId, principalType: "USER" },
    select: { id: true, level: true, principalId: true },
  });
  if (grants.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: grants.map((g) => g.principalId) } },
    select: { id: true, email: true, displayName: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return grants
    .map((g) => {
      const u = byId.get(g.principalId);
      return u ? { id: g.id, level: g.level, user: u } : null;
    })
    .filter((g): g is ResourceGrant => g !== null);
}

/** The resource a permission points at, for owner re-check before revoking. */
export async function getPermissionResource(
  permissionId: string,
): Promise<{ resourceType: ResourceType; resourceId: string } | null> {
  const p = await prisma.permission.findUnique({
    where: { id: permissionId },
    select: { resourceType: true, resourceId: true },
  });
  return p;
}

export async function revokePermission(permissionId: string): Promise<void> {
  await prisma.permission.delete({ where: { id: permissionId } });
}

export interface SharedFileDTO {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: PreviewKind;
  hasThumb: boolean;
  level: $Enums.AccessLevel;
  ownerName: string;
}
export interface SharedFolderDTO {
  id: string;
  name: string;
  color: string | null;
  level: $Enums.AccessLevel;
  ownerName: string;
}

/** Files & folders directly granted to a user (excludes anything they own). */
export async function listSharedWithUser(
  userId: string,
): Promise<{ files: SharedFileDTO[]; folders: SharedFolderDTO[] }> {
  const grants = await prisma.permission.findMany({
    where: { principalType: "USER", principalId: userId },
    select: { resourceType: true, resourceId: true, level: true },
  });
  const levelByFile = new Map<string, $Enums.AccessLevel>();
  const levelByFolder = new Map<string, $Enums.AccessLevel>();
  for (const g of grants) {
    if (g.resourceType === "FILE") levelByFile.set(g.resourceId, g.level);
    else levelByFolder.set(g.resourceId, g.level);
  }

  const [files, folders] = await Promise.all([
    levelByFile.size
      ? prisma.file.findMany({
          where: { id: { in: [...levelByFile.keys()] }, NOT: { ownerId: userId } },
          select: {
            id: true,
            name: true,
            owner: { select: { displayName: true, email: true } },
            blob: {
              select: {
                size: true,
                mimeType: true,
                derivatives: { where: { kind: "thumb" }, select: { id: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    levelByFolder.size
      ? prisma.folder.findMany({
          where: { id: { in: [...levelByFolder.keys()] }, NOT: { ownerId: userId } },
          select: {
            id: true,
            name: true,
            color: true,
            owner: { select: { displayName: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: Number(f.blob.size),
      mime: f.blob.mimeType,
      kind: previewKindOf(f.blob.mimeType, f.name),
      hasThumb: f.blob.derivatives.length > 0,
      level: levelByFile.get(f.id)!,
      ownerName: f.owner.displayName ?? f.owner.email,
    })),
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      level: levelByFolder.get(f.id)!,
      ownerName: f.owner.displayName ?? f.owner.email,
    })),
  };
}

/** Read-only listing of a folder's direct contents (for the shared-folder view). */
export async function listFolderContents(
  folderId: string,
): Promise<{ folders: SharedFolderDTO[]; files: SharedFileDTO[]; name: string } | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { name: true, owner: { select: { displayName: true, email: true } } },
  });
  if (!folder) return null;
  const ownerName = folder.owner.displayName ?? folder.owner.email;

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.file.findMany({
      where: { folderId },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
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
    name: folder.name,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      level: "READ" as const,
      ownerName,
    })),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: Number(f.blob.size),
      mime: f.blob.mimeType,
      kind: previewKindOf(f.blob.mimeType, f.name),
      hasThumb: f.blob.derivatives.length > 0,
      level: "READ" as const,
      ownerName,
    })),
  };
}
