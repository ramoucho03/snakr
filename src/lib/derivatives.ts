import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { prisma } from "./db";
import { storage, blobKey, derivedKey } from "./storage";
import { previewKindOf } from "./mime";

/**
 * Thumbnail / poster generation, run AFTER an upload finishes (never inline in
 * the request). Keyed by source blob hash so it is regenerable and cache-safe.
 * Every step is best-effort: a missing ffmpeg or an undecodable file must never
 * fail the upload — the grid simply falls back to a type icon.
 */

const THUMB_MAX = 640;

async function storeThumb(
  blobHash: string,
  buffer: Buffer,
  width: number,
  height: number,
): Promise<void> {
  const key = derivedKey(blobHash, "thumb", "webp");
  await storage().put(key, Readable.from(buffer));
  await prisma.derivative.upsert({
    where: { blobHash_kind: { blobHash, kind: "thumb" } },
    create: { blobHash, kind: "thumb", key, width, height },
    update: { key, width, height },
  });
}

async function imageThumb(blobHash: string, srcAbs: string): Promise<void> {
  const { data, info } = await sharp(srcAbs, { failOn: "none", animated: false })
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer({ resolveWithObject: true });
  await storeThumb(blobHash, data, info.width, info.height);
}

async function videoThumb(blobHash: string, srcAbs: string): Promise<void> {
  // Lazy-require so the ffmpeg deps never load for image-only deployments.
  const ffmpegStatic = (await import("ffmpeg-static")).default as unknown as string;
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  if (ffmpegStatic) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || ffmpegStatic);

  const tmp = path.join(
    os.tmpdir(),
    `snakr-frame-${crypto.randomBytes(6).toString("hex")}.jpg`,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(srcAbs)
        .inputOptions(["-ss", "1"]) // seek BEFORE input = fast + cheap
        .outputOptions(["-frames:v", "1", "-q:v", "3"])
        .output(tmp)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
    const { data, info } = await sharp(tmp)
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });
    await storeThumb(blobHash, data, info.width, info.height);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Generate derivatives for a blob if its type supports a visual preview. */
export async function generateDerivatives(blobHash: string): Promise<void> {
  try {
    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { mimeType: true, files: { select: { name: true }, take: 1 } },
    });
    if (!blob) return;

    const kind = previewKindOf(blob.mimeType, blob.files[0]?.name ?? "");
    const srcAbs = storage().absPath(blobKey(blobHash));

    if (kind === "image") await imageThumb(blobHash, srcAbs);
    else if (kind === "video") await videoThumb(blobHash, srcAbs);
  } catch (err) {
    // Non-fatal: log and move on. The file remains fully usable without a thumb.
    console.warn(`[derivatives] ${blobHash} failed:`, (err as Error).message);
  }
}
