import "server-only";
import { Readable } from "node:stream";
import { storage } from "./storage";
import { safeContentType } from "./mime";

/**
 * HTTP byte-serving helpers shared by the authenticated download route and the
 * public share route. Range support is mandatory — Vidstack scrubbing and Safari
 * video playback both require a correct 206 with Content-Range.
 */

export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start = m[1] ? Number.parseInt(m[1], 10) : Number.NaN;
  let end = m[2] ? Number.parseInt(m[2], 10) : Number.NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    // suffix form: bytes=-N → last N bytes
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end) || end >= size) {
    // open-ended (bytes=N-) or an over-long last-byte-pos → clamp to the end.
    // Per RFC 7233 this is satisfiable, not a 416.
    end = size - 1;
  }
  if (start < 0 || start >= size || start > end) return null; // truly unsatisfiable
  return { start, end };
}

/** RFC 5987 encoding for the Content-Disposition filename* parameter. */
function encodeFilename(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Node Readable → Web ReadableStream, hardened against client cancellation.
 *
 * `Readable.toWeb()` throws an UNCAUGHT `ERR_INVALID_STATE: Controller is
 * already closed` when the browser aborts a byte request (a very common event —
 * cancelled <img> loads, seeked/closed video, navigation). That uncaught
 * exception can tear down an unrelated in-flight response stream, surfacing as a
 * bogus "Controller is already closed" during a page's RSC flush. This hand-
 * rolled adapter guards every controller call and destroys the Node stream on
 * cancel, so an aborted download can never escape as an uncaught error.
 */
function toWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  let closed = false;
  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      /* already closed by a cancel — ignore */
    }
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
          nodeStream.destroy();
          return;
        }
        if ((controller.desiredSize ?? 1) <= 0) nodeStream.pause();
      });
      nodeStream.on("end", () => finish(controller));
      nodeStream.on("error", (err) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(err);
        } catch {
          /* consumer already gone — ignore */
        }
      });
    },
    pull() {
      nodeStream.resume();
    },
    cancel() {
      closed = true;
      nodeStream.destroy();
    },
  });
}

export interface ServeOptions {
  key: string;
  size: number;
  mime: string;
  filename: string;
  rangeHeader: string | null;
  /** "inline" (preview) or "attachment" (download). */
  disposition: "inline" | "attachment";
  /** Content-addressed derivatives are immutable and may be cached hard. */
  immutable?: boolean;
  /**
   * A strong validator for these exact bytes. Supplying it turns on conditional
   * requests: the browser keeps its copy and revalidates for free instead of
   * re-downloading gigabytes on every navigation.
   *
   * Deliberately opt-in. `/api/s/[token]` must NOT pass one — a 304 there would
   * hand back the file without going through the atomic download claim.
   */
  etag?: string;
  ifNoneMatch?: string | null;
  ifRange?: string | null;
  /**
   * Allow shared caches (a reverse proxy, a social-network scraper's CDN) to
   * store the response. PUBLIC/UNLISTED derivatives only — never ACL'd bytes.
   */
  publicCache?: boolean;
}

/** `"abc"` and `W/"abc"` name the same representation for If-None-Match. */
function etagMatches(header: string | null | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .includes(etag);
}

function cacheControl(opts: ServeOptions): string {
  if (opts.immutable) {
    // `s-maxage` caps SHARED caches (a reverse proxy, a scraper's CDN) at an
    // hour while the browser keeps its copy for a year. Un-publishing a video
    // should not leave its thumbnail sitting in the operator's proxy cache
    // until next summer; a per-user browser cache holds nothing it was not
    // already allowed to see.
    return opts.publicCache
      ? "public, max-age=31536000, immutable, s-maxage=3600"
      : "private, max-age=31536000, immutable";
  }
  // With a validator the browser can hold the bytes and ask "still current?" —
  // a 304 costs one round-trip instead of the whole file. Without one it has no
  // way to revalidate and must re-download, so tell it not to bother caching.
  return opts.etag ? "private, max-age=0, must-revalidate" : "private, no-cache, must-revalidate";
}

/** Build a Range-aware streaming Response for a stored object. */
export async function serveBlob(opts: ServeOptions): Promise<Response> {
  const cc = cacheControl(opts);
  const base: Record<string, string> = {
    "Content-Type": safeContentType(opts.mime),
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": cc,
    "Content-Disposition": `${opts.disposition}; filename*=UTF-8''${encodeFilename(opts.filename)}`,
  };
  if (opts.etag) base.ETag = opts.etag;

  // Revalidation of a whole representation. A ranged request is deliberately
  // excluded: a media element asking for bytes N.. wants bytes, and answering
  // it with an empty 304 is a reliable way to stall a video in the wild even
  // though RFC 9110 permits it.
  if (opts.etag && !opts.rangeHeader && etagMatches(opts.ifNoneMatch, opts.etag)) {
    return new Response(null, { status: 304, headers: { ETag: opts.etag, "Cache-Control": cc } });
  }

  const range = parseRange(opts.rangeHeader, opts.size);
  if (opts.rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${opts.size}` },
    });
  }

  // If-Range: the client holds a partial copy and wants the rest ONLY if what we
  // have is still the same representation. When it isn't, RFC 9110 says serve
  // the whole thing — which is exactly what stops a player from stitching bytes
  // of one representation onto another.
  const staleRange = range != null && opts.ifRange != null && !etagMatches(opts.ifRange, opts.etag ?? "");

  if (range && !staleRange) {
    const stream = await storage().stream(opts.key, range);
    return new Response(toWeb(stream), {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${range.start}-${range.end}/${opts.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  const stream = await storage().stream(opts.key);
  return new Response(toWeb(stream), {
    status: 200,
    headers: { ...base, "Content-Length": String(opts.size) },
  });
}

/**
 * Serve a mutable, publicly-cacheable image (avatar / banner). The storage key
 * uniquely identifies the current bytes, so it doubles as a strong ETag: the
 * browser revalidates cheaply and picks up a new image the instant the key
 * changes. Returns 404 for a null key, 304 when the client's copy is current.
 */
export async function serveStoredImage(
  key: string | null,
  ifNoneMatch: string | null,
  mime = "image/webp",
): Promise<Response> {
  if (!key) return new Response(null, { status: 404 });
  const etag = `"${key}"`;
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const stat = await storage().stat(key);
  if (!stat) return new Response(null, { status: 404 });

  const stream = await storage().stream(key);
  return new Response(toWeb(stream), {
    status: 200,
    headers: {
      "Content-Type": safeContentType(mime),
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: etag,
    },
  });
}
