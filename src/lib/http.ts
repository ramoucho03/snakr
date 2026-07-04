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

function toWeb(stream: Readable): ReadableStream {
  return Readable.toWeb(stream) as unknown as ReadableStream;
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
