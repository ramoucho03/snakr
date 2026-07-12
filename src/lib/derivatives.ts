import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { prisma } from "./db";
import { storage, blobKey, derivedKey } from "./storage";
import { previewKindOf } from "./mime";
import { ffmpegCommand, moovAtEnd, probeMedia } from "./probe";

/**
 * Derivative generation, run AFTER an upload finishes (never inline in the
 * request). Keyed by source blob hash so everything is regenerable and
 * cache-safe. Every step is best-effort: a missing ffmpeg or an undecodable
 * file must never fail an upload — the grid falls back to a type icon.
 *
 * What a video blob gets:
 *   probe    → durationSec / width / height on the Blob row (see probe.ts)
 *   thumb    → 640px WebP, the grid poster
 *   poster   → 1280×720 WebP + JPEG twin, social cards and the player poster
 *   preview  → ~6s silent 480p MP4, the hover scrub preview
 *   fast     → source remuxed moov-first, ONLY when the source needs it
 *
 * `ensureProbe` / `ensurePoster` / `ensurePreview` are the lazy, idempotent
 * entry points: content uploaded before this pipeline existed heals itself the
 * first time somebody looks at it, with no migration script to run.
 */

const THUMB_MAX = 640;

/** Facebook/LinkedIn want ≥ 1200px wide; 1280×720 is the 16:9 size everyone renders. */
const POSTER_W = 1280;
const POSTER_H = 720;

const PREVIEW_SECONDS = 6;
const PREVIEW_HEIGHT = 360;

/** Above this, a faststart remux costs more disk than the start-up latency is worth. */
const FASTSTART_MAX_BYTES = 6 * 1024 ** 3;

/** MP4 can only stream-copy these; anything else would need a real re-encode. */
const MP4_VIDEO_CODECS = new Set(["h264", "hevc", "h265", "mpeg4", "av1"]);
const MP4_AUDIO_CODECS = new Set(["aac", "mp3", "ac3", "eac3", "opus"]);

export type DerivativeKind = "thumb" | "poster" | "preview" | "fast";

/* ---------------------------------------------------------------------------
   In-flight dedup. Two visitors hitting the same cold poster must not race two
   ffmpeg processes at the same output key.
--------------------------------------------------------------------------- */
const inFlight = new Map<string, Promise<unknown>>();

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** A temp path in the OS temp dir, unique per call. */
function tmpPath(ext: string): string {
  return path.join(os.tmpdir(), `snakr-${crypto.randomBytes(8).toString("hex")}.${ext}`);
}

async function record(
  blobHash: string,
  kind: DerivativeKind,
  key: string,
  meta: { width?: number | null; height?: number | null; size?: number | null; mimeType?: string | null },
): Promise<void> {
  const data = {
    key,
    width: meta.width ?? null,
    height: meta.height ?? null,
    size: meta.size ?? null,
    mimeType: meta.mimeType ?? null,
  };
  await prisma.derivative.upsert({
    where: { blobHash_kind: { blobHash, kind } },
    create: { blobHash, kind, ...data },
    update: data,
  });
}

async function existingKey(blobHash: string, kind: DerivativeKind): Promise<string | null> {
  const d = await prisma.derivative.findUnique({
    where: { blobHash_kind: { blobHash, kind } },
    select: { key: true },
  });
  return d?.key ?? null;
}

/* ===========================================================================
   Probe — duration / dimensions onto the Blob row.
   =========================================================================== */

/**
 * Fill `Blob.durationSec/width/height` if they are missing. Idempotent, cheap
 * (ffprobe reads headers, it does not decode) and safe to await on a page that
 * genuinely needs the duration — the watch page needs it to size the buffer.
 *
 * `probedAt` is stamped even when the probe comes back empty, so an unprobeable
 * file is attempted once and never again.
 */
export async function ensureProbe(blobHash: string): Promise<void> {
  return once(`probe:${blobHash}`, async () => {
    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { probedAt: true, mimeType: true },
    });
    if (!blob || blob.probedAt) return;
    if (!/^(video|audio)\//.test(blob.mimeType)) {
      await prisma.blob.update({ where: { hash: blobHash }, data: { probedAt: new Date() } }).catch(() => {});
      return;
    }

    const probe = await probeMedia(storage().absPath(blobKey(blobHash)));
    await prisma.blob
      .update({
        where: { hash: blobHash },
        data: {
          durationSec: probe?.durationSec ?? null,
          width: probe?.width ?? null,
          height: probe?.height ?? null,
          probedAt: new Date(),
        },
      })
      .catch(() => {
        /* row vanished under a concurrent delete — nothing to record */
      });
  });
}

/**
 * Fire-and-forget probe for a listing. Bounded so one cold grid can't spawn a
 * hundred ffprobe processes; the rest heal on the next page view.
 */
export function backfillProbes(blobHashes: string[], limit = 6): void {
  for (const hash of blobHashes.slice(0, limit)) {
    void ensureProbe(hash).catch(() => {});
  }
}

/* ===========================================================================
   Images.
   =========================================================================== */

async function imageThumb(blobHash: string, srcAbs: string): Promise<void> {
  const { data, info } = await sharp(srcAbs, { failOn: "none", animated: false })
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer({ resolveWithObject: true });
  const key = derivedKey(blobHash, "thumb", "webp");
  await storage().put(key, Readable.from(data));
  await record(blobHash, "thumb", key, { width: info.width, height: info.height, size: data.length, mimeType: "image/webp" });
}

/* ===========================================================================
   Video.
   =========================================================================== */

/** Grab one frame as a JPEG at `seekSeconds`. Seeking BEFORE the input is O(1). */
async function extractFrame(srcAbs: string, seekSeconds: number, outAbs: string): Promise<void> {
  const cmd = await ffmpegCommand(srcAbs);
  await new Promise<void>((resolve, reject) => {
    cmd
      .inputOptions(["-ss", String(seekSeconds)])
      .outputOptions(["-frames:v", "1", "-q:v", "3"])
      .output(outAbs)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/**
 * A frame from 1s in, or from 10% in for anything longer than a minute — the
 * first second of a video is very often a black fade or a slate.
 */
function posterSeek(durationSec: number | null): number {
  if (!durationSec || durationSec < 12) return 1;
  return Math.min(durationSec * 0.1, 30);
}

async function videoThumb(blobHash: string, srcAbs: string, durationSec: number | null): Promise<void> {
  const frame = tmpPath("jpg");
  try {
    await extractFrame(srcAbs, posterSeek(durationSec), frame);
    const { data, info } = await sharp(frame)
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });
    const key = derivedKey(blobHash, "thumb", "webp");
    await storage().put(key, Readable.from(data));
    await record(blobHash, "thumb", key, { width: info.width, height: info.height, size: data.length, mimeType: "image/webp" });
  } finally {
    await fs.rm(frame, { force: true });
  }
}

/**
 * The social card image: exactly 1280×720, letterboxed on black so a portrait
 * or ultrawide source is never cropped. Emitted as JPEG — WebP og:image is
 * still rejected by several unfurlers (older Facebook, some mail clients).
 */
async function buildPoster(blobHash: string, sourceJpeg: string): Promise<string> {
  const buf = await sharp(sourceJpeg)
    .resize(POSTER_W, POSTER_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  const key = derivedKey(blobHash, "poster", "jpg");
  await storage().put(key, Readable.from(buf));
  await record(blobHash, "poster", key, {
    width: POSTER_W,
    height: POSTER_H,
    size: buf.length,
    mimeType: "image/jpeg",
  });
  return key;
}

/**
 * The hover preview: ~6 silent seconds at 360p, starting a tenth of the way in.
 * Streaming the ORIGINAL for a hover costs megabytes off a home uplink; this is
 * a couple hundred kilobytes and it starts on the first byte (faststart).
 */
async function buildPreview(blobHash: string, srcAbs: string, durationSec: number | null): Promise<string | null> {
  if (durationSec != null && durationSec < 3) return null; // nothing to preview
  const start = posterSeek(durationSec);
  const out = tmpPath("mp4");
  try {
    const cmd = await ffmpegCommand(srcAbs);
    await new Promise<void>((resolve, reject) => {
      cmd
        .inputOptions(["-ss", String(start)])
        .outputOptions([
          "-t", String(PREVIEW_SECONDS),
          "-an", // silent: a muted hover preview never needs the audio track
          "-vf", `scale=-2:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease`,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "30",
          "-pix_fmt", "yuv420p", // Safari refuses yuv444/yuv422 h264
          "-movflags", "+faststart",
        ])
        .output(out)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });

    const stat = await fs.stat(out);
    if (stat.size === 0) return null;
    const key = derivedKey(blobHash, "preview", "mp4");
    await storage().put(key, createReadStream(out));
    await record(blobHash, "preview", key, { height: PREVIEW_HEIGHT, size: stat.size, mimeType: "video/mp4" });
    return key;
  } finally {
    await fs.rm(out, { force: true });
  }
}

/**
 * Remux the source moov-first so the browser can render frame one from the
 * first Range response instead of round-tripping for the index at EOF.
 *
 * Stored as a DERIVATIVE, never in place: the Blob is content-addressed by the
 * sha256 of the bytes the user uploaded, and `?dl=1` must keep handing back
 * exactly those bytes. It also doubles as the compatibility path — a stream
 * copy out of Matroska is what makes an MKV playable in Safari at all.
 */
async function buildFaststart(
  blobHash: string,
  srcAbs: string,
  mime: string,
  size: number,
  probe: { videoCodec: string | null; audioCodec: string | null } | null,
): Promise<string | null> {
  if (process.env.VIDEO_REMUX === "off") return null;
  if (size > FASTSTART_MAX_BYTES) return null;

  // Matroska has no moov atom at all; a stream copy into MP4 both fixes the
  // start-up cost and makes it playable in Safari, which cannot decode MKV.
  const isIsoBmff = mime === "video/mp4" || mime === "video/quicktime";
  if (!isIsoBmff && mime !== "video/x-matroska") return null;

  if (isIsoBmff && (await moovAtEnd(srcAbs)) !== true) return null; // already starts fast

  // A stream copy is only legal if MP4 can carry the codecs as they are.
  if (probe?.videoCodec && !MP4_VIDEO_CODECS.has(probe.videoCodec)) return null;
  if (probe?.audioCodec && !MP4_AUDIO_CODECS.has(probe.audioCodec)) return null;

  const out = tmpPath("mp4");
  try {
    const cmd = await ffmpegCommand(srcAbs);
    await new Promise<void>((resolve, reject) => {
      cmd
        .outputOptions(["-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart"])
        .output(out)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });

    const stat = await fs.stat(out);
    // A remux is a copy: same payload, new box order. Anything wildly bigger
    // means ffmpeg did something we did not ask for — refuse it.
    if (stat.size === 0 || stat.size > size * 1.1) return null;
    if ((await moovAtEnd(out)) !== false) return null; // did not actually gain us anything

    const key = derivedKey(blobHash, "fast", "mp4");
    await storage().put(key, createReadStream(out));
    await record(blobHash, "fast", key, { size: stat.size, mimeType: "video/mp4" });
    return key;
  } finally {
    await fs.rm(out, { force: true });
  }
}

/**
 * Produce the faststart variant on demand. Deliberately NOT part of the upload
 * pipeline: a remux is a full second copy of the file on disk, and a private
 * drive video that nobody streams should never pay for one. Published videos do
 * — so this is called when a video leaves PRIVATE, and (self-healingly) when a
 * watch page renders one that predates this pipeline.
 *
 * A page picks the variant ONCE and pins it into the media URL (`?v=fast`), so
 * a remux finishing mid-playback can never shift the byte offsets under a
 * player that is already streaming the original.
 */
export async function ensureFast(blobHash: string): Promise<string | null> {
  const existing = await existingKey(blobHash, "fast");
  if (existing) return existing;

  return once(`fast:${blobHash}`, async () => {
    const again = await existingKey(blobHash, "fast");
    if (again) return again;

    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { mimeType: true, size: true },
    });
    if (!blob || !blob.mimeType.startsWith("video/")) return null;

    const srcAbs = storage().absPath(blobKey(blobHash));
    try {
      const probe = await probeMedia(srcAbs);
      return await buildFaststart(blobHash, srcAbs, blob.mimeType, Number(blob.size), probe);
    } catch (err) {
      console.warn(`[derivatives] faststart ${blobHash} failed:`, (err as Error).message);
      return null;
    }
  });
}

/* ===========================================================================
   Lazy, idempotent accessors — used by the byte routes and the OG metadata.
   =========================================================================== */

/**
 * The 1280×720 social poster, generated on first use. Returns null when the
 * source has no visual frame (or ffmpeg is missing).
 */
export async function ensurePoster(blobHash: string): Promise<string | null> {
  const existing = await existingKey(blobHash, "poster");
  if (existing) return existing;

  return once(`poster:${blobHash}`, async () => {
    const again = await existingKey(blobHash, "poster");
    if (again) return again;

    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { mimeType: true, durationSec: true, files: { select: { name: true }, take: 1 } },
    });
    if (!blob) return null;

    const kind = previewKindOf(blob.mimeType, blob.files[0]?.name ?? "");
    const srcAbs = storage().absPath(blobKey(blobHash));

    try {
      if (kind === "image") return await buildPoster(blobHash, srcAbs);
      if (kind === "video") {
        const frame = tmpPath("jpg");
        try {
          await extractFrame(srcAbs, posterSeek(blob.durationSec), frame);
          return await buildPoster(blobHash, frame);
        } finally {
          await fs.rm(frame, { force: true });
        }
      }
    } catch (err) {
      console.warn(`[derivatives] poster ${blobHash} failed:`, (err as Error).message);
    }
    return null;
  });
}

/** The hover preview clip, generated on first use. Null when unavailable. */
export async function ensurePreview(blobHash: string): Promise<string | null> {
  const existing = await existingKey(blobHash, "preview");
  if (existing) return existing;

  return once(`preview:${blobHash}`, async () => {
    const again = await existingKey(blobHash, "preview");
    if (again) return again;

    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { mimeType: true, durationSec: true },
    });
    if (!blob || !blob.mimeType.startsWith("video/")) return null;

    try {
      return await buildPreview(blobHash, storage().absPath(blobKey(blobHash)), blob.durationSec);
    } catch (err) {
      console.warn(`[derivatives] preview ${blobHash} failed:`, (err as Error).message);
      return null;
    }
  });
}

/**
 * Bring a video up to the full set of derivatives a published video wants, in
 * the background and one ffmpeg at a time — three concurrent encodes would stall
 * a home server while somebody is watching.
 *
 * Called when a video is published and when a watch page renders one, which is
 * what heals content uploaded before any of these existed. It has to be pushed
 * rather than pulled: `og:image` only points at the poster once a poster exists,
 * so a purely lazy route would wait for a request that never comes.
 */
export function ensurePublishedDerivatives(blobHash: string): void {
  void (async () => {
    await ensurePoster(blobHash).catch(() => {});
    await ensurePreview(blobHash).catch(() => {});
    await ensureFast(blobHash).catch(() => {});
  })();
}

/* ===========================================================================
   Upload-time entry point.
   =========================================================================== */

/** Generate every derivative a blob's type supports. Fire-and-forget by design. */
export async function generateDerivatives(blobHash: string): Promise<void> {
  try {
    const blob = await prisma.blob.findUnique({
      where: { hash: blobHash },
      select: { mimeType: true, size: true, files: { select: { name: true }, take: 1 } },
    });
    if (!blob) return;

    const kind = previewKindOf(blob.mimeType, blob.files[0]?.name ?? "");
    const srcAbs = storage().absPath(blobKey(blobHash));

    if (kind === "image") {
      await imageThumb(blobHash, srcAbs);
      return;
    }
    if (kind !== "video" && kind !== "audio") return;

    // One probe feeds every downstream step (poster seek, remux legality).
    const probe = await probeMedia(srcAbs);
    await prisma.blob
      .update({
        where: { hash: blobHash },
        data: {
          durationSec: probe?.durationSec ?? null,
          width: probe?.width ?? null,
          height: probe?.height ?? null,
          probedAt: new Date(),
        },
      })
      .catch(() => {});

    if (kind !== "video") return;

    // Each step is independently best-effort: a failed preview must not cost us
    // the thumbnail that the whole grid depends on. Sequential on purpose —
    // three concurrent ffmpeg processes would starve a home server mid-upload.
    // The faststart remux is NOT here: it doubles the file on disk, so it waits
    // until the video is actually published (see ensureFast).
    const steps: [string, () => Promise<unknown>][] = [
      ["thumb", () => videoThumb(blobHash, srcAbs, probe?.durationSec ?? null)],
      ["preview", () => buildPreview(blobHash, srcAbs, probe?.durationSec ?? null)],
    ];
    for (const [name, run] of steps) {
      await run().catch((err: Error) => {
        console.warn(`[derivatives] ${name} ${blobHash} failed:`, err.message);
      });
    }
  } catch (err) {
    // Non-fatal: log and move on. The file remains fully usable without derivatives.
    console.warn(`[derivatives] ${blobHash} failed:`, (err as Error).message);
  }
}
