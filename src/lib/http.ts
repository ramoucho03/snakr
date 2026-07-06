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
}

/** Build a Range-aware streaming Response for a stored object. */
export async function serveBlob(opts: ServeOptions): Promise<Response> {
  const base: Record<string, string> = {
    "Content-Type": safeContentType(opts.mime),
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.immutable
      ? "private, max-age=31536000, immutable"
      : "private, no-cache, must-revalidate",
    "Content-Disposition": `${opts.disposition}; filename*=UTF-8''${encodeFilename(opts.filename)}`,
  };

  const range = parseRange(opts.rangeHeader, opts.size);
  if (opts.rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${opts.size}` },
    });
  }

  if (range) {
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
