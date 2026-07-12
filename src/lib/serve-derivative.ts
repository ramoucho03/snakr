import "server-only";
import { requireRead } from "./access";
import { prisma } from "./db";
import { serveBlob } from "./http";
import { storage } from "./storage";
import { statusOf } from "./errors";
import { isWatchableRow } from "./videos";
import { ensurePoster, ensurePreview, type DerivativeKind } from "./derivatives";

/**
 * The one code path that serves a derivative (thumbnail, social poster, hover
 * preview) over HTTP. Three routes share it so the ACL decision, the caching
 * policy and the lazy-generation fallback can never drift apart between them.
 *
 * Access mirrors the byte route exactly: a PUBLIC/UNLISTED video's derivatives
 * are visible to anyone — a social-network scraper has no session and still has
 * to fetch the `og:image`. Everything else goes through `requireRead`.
 */

const LAZY: Partial<Record<DerivativeKind, (blobHash: string) => Promise<string | null>>> = {
  poster: ensurePoster,
  preview: ensurePreview,
};

const FILENAME: Record<string, string> = {
  thumb: "thumbnail.webp",
  poster: "poster.jpg",
  preview: "preview.mp4",
};

/** Rows written before `Derivative.mimeType` existed carry null; kind implies it. */
const MIME: Record<DerivativeKind, string> = {
  thumb: "image/webp",
  poster: "image/jpeg",
  preview: "video/mp4",
  fast: "video/mp4",
};

export async function serveDerivative(
  fileId: string,
  kind: DerivativeKind,
  req: { rangeHeader: string | null; ifNoneMatch: string | null },
): Promise<Response> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        visibility: true,
        blobHash: true,
        blob: {
          select: {
            mimeType: true,
            derivatives: { where: { kind }, select: { key: true, size: true, mimeType: true } },
          },
        },
      },
    });

    // Same ordering as /api/files/[id]: an unknown id must reach `requireRead`
    // so anonymous callers cannot distinguish "absent" from "private".
    const watchable = file != null && isWatchableRow(file);
    if (!watchable) await requireRead("FILE", fileId);
    if (!file) return new Response(null, { status: 404 });

    // Posters and previews are built on first use, so content that predates this
    // pipeline heals itself instead of needing a migration script.
    let derivative = file.blob.derivatives[0];
    if (!derivative) {
      const built = await LAZY[kind]?.(file.blobHash);
      if (!built) return new Response(null, { status: 404 });
      const row = await prisma.derivative.findUnique({
        where: { blobHash_kind: { blobHash: file.blobHash, kind } },
        select: { key: true, size: true, mimeType: true },
      });
      if (!row) return new Response(null, { status: 404 });
      derivative = row;
    }

    // `size` was added late; fall back to a stat for rows written before it.
    const size = derivative.size ?? (await storage().stat(derivative.key))?.size;
    if (size == null) return new Response(null, { status: 404 });

    return await serveBlob({
      key: derivative.key,
      size,
      mime: derivative.mimeType ?? MIME[kind],
      filename: FILENAME[kind] ?? kind,
      rangeHeader: req.rangeHeader,
      disposition: "inline",
      // Derivatives are named by the content hash of their source: the bytes at
      // a given key never change, so they can be cached forever.
      immutable: true,
      etag: `"${derivative.key}"`,
      ifNoneMatch: req.ifNoneMatch,
      // A published video's still is public by construction — letting the
      // reverse proxy and the scrapers' CDNs hold it is the whole point of an
      // og:image. ACL'd derivatives stay private.
      publicCache: watchable,
    });
  } catch (err) {
    return new Response(null, { status: statusOf(err) });
  }
}
