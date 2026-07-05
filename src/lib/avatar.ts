import "server-only";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { prisma } from "./db";
import { storage } from "./storage";

/**
 * Avatar & channel-banner assets. Unlike content blobs these are mutable per
 * user, so each save writes a fresh randomly-suffixed key and the old file is
 * deleted. The DB column (`avatarKey` / `bannerKey`) therefore uniquely
 * identifies the current bytes and doubles as a perfect ETag — the serving
 * routes revalidate against it, so an updated avatar shows instantly with no
 * stale-cache tricks.
 */

const AVATAR_PX = 512;
const BANNER_W = 1600;
const BANNER_H = 400;

function profileKey(userId: string, kind: "avatar" | "banner"): string {
  const token = crypto.randomBytes(8).toString("hex");
  return `profile/${userId}/${kind}-${token}.webp`;
}

async function replaceAsset(oldKey: string | null, newKey: string, buffer: Buffer) {
  await storage().put(newKey, Readable.from(buffer));
  if (oldKey && oldKey !== newKey) {
    await storage().delete(oldKey).catch(() => {
      /* best effort — a leaked old asset is harmless */
    });
  }
}

/** Resize + re-encode to a square webp avatar, store it, return the new key. */
export async function saveAvatar(userId: string, input: Buffer): Promise<string> {
  const webp = await sharp(input, { failOn: "none", animated: false })
    .rotate()
    .resize(AVATAR_PX, AVATAR_PX, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  const key = profileKey(userId, "avatar");
  await replaceAsset(current?.avatarKey ?? null, key, webp);
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
  return key;
}

/** Resize + re-encode to a wide webp banner, store it, return the new key. */
export async function saveBanner(userId: string, input: Buffer): Promise<string> {
  const webp = await sharp(input, { failOn: "none", animated: false })
    .rotate()
    .resize(BANNER_W, BANNER_H, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toBuffer();

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannerKey: true },
  });
  const key = profileKey(userId, "banner");
  await replaceAsset(current?.bannerKey ?? null, key, webp);
  await prisma.user.update({ where: { id: userId }, data: { bannerKey: key } });
  return key;
}

export async function removeAvatar(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  if (u?.avatarKey) await storage().delete(u.avatarKey).catch(() => {});
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
}

export async function removeBanner(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannerKey: true },
  });
  if (u?.bannerKey) await storage().delete(u.bannerKey).catch(() => {});
  await prisma.user.update({ where: { id: userId }, data: { bannerKey: null } });
}

/** The storage key + ETag for a user's avatar/banner, or null if unset. */
export async function getProfileAsset(
  userId: string,
  kind: "avatar" | "banner",
): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true, bannerKey: true },
  });
  if (!u) return null;
  return kind === "avatar" ? u.avatarKey : u.bannerKey;
}
