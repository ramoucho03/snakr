import type { NextRequest } from "next/server";
import { requireRead } from "@/lib/access";
import { getServableFile } from "@/lib/files";
import { isWatchableRow } from "@/lib/videos";
import { serveBlob } from "@/lib/http";
import { blobKey } from "@/lib/storage";
import { statusOf } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * File serving. `?dl=1` forces a download (attachment); otherwise bytes are
 * served inline for the in-app previewers. Always Range-aware, always `nosniff`.
 *
 * `?v=fast` asks for the moov-first remux of a video. The PAGE decides that,
 * once, and bakes it into the URL — see `videoSrc()`. Picking the variant here,
 * per request, would let a remux that lands mid-playback shift every byte offset
 * under a player that is already streaming the original.
 *
 * Access: a PUBLIC/UNLISTED video is served to anyone (the anonymous /watch
 * path) — the ONLY ACL bypass, and it is scoped to watchable videos. Everything
 * else must pass `requireRead`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const file = await getServableFile(id);

    // A missing id must land in `requireRead` exactly as it did before, or an
    // anonymous caller could tell "does not exist" (404) from "exists but is
    // private" (401) and enumerate the instance.
    if (!file || !isWatchableRow(file)) await requireRead("FILE", id);
    if (!file) return new Response("Introuvable", { status: 404 });

    const download = req.nextUrl.searchParams.get("dl") === "1";

    // A download always hands back the pristine bytes the user uploaded; only
    // inline playback may be served the remux. A remux row with no recorded
    // size is unusable — Content-Length would describe the wrong file.
    const fast =
      !download && req.nextUrl.searchParams.get("v") === "fast"
        ? file.blob.derivatives.find((d) => d.kind === "fast" && d.size != null)
        : undefined;

    const key = fast?.key ?? blobKey(file.blob.hash);
    const size = fast?.size ?? Number(file.blob.size);
    const mime = fast?.mimeType ?? file.blob.mimeType;

    return await serveBlob({
      key,
      size,
      mime,
      filename: file.name,
      rangeHeader: req.headers.get("range"),
      disposition: download ? "attachment" : "inline",
      // The storage key names the exact bytes (content hash, or a derivative of
      // one), so it is a free strong validator. Without it the browser cannot
      // revalidate and re-downloads the whole video on every navigation.
      etag: `"${key}"`,
      ifNoneMatch: req.headers.get("if-none-match"),
      ifRange: req.headers.get("if-range"),
      // Never `publicCache`: an UNLISTED video's bytes must not land in a
      // shared cache just because its page is reachable without a session.
    });
  } catch (err) {
    return new Response("Erreur", { status: statusOf(err) });
  }
}
