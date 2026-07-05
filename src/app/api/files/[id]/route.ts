import type { NextRequest } from "next/server";
import { requireRead } from "@/lib/access";
import { getFileRecord } from "@/lib/files";
import { isPubliclyWatchable } from "@/lib/videos";
import { serveBlob } from "@/lib/http";
import { blobKey } from "@/lib/storage";
import { statusOf } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * File serving. `?dl=1` forces a download (attachment); otherwise bytes are
 * served inline for the in-app previewers. Always Range-aware, always `nosniff`.
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
    if (!(await isPubliclyWatchable(id))) {
      await requireRead("FILE", id);
    }
    const file = await getFileRecord(id);
    if (!file) return new Response("Introuvable", { status: 404 });

    const download = req.nextUrl.searchParams.get("dl") === "1";
    return await serveBlob({
      key: blobKey(file.blob.hash),
      size: Number(file.blob.size),
      mime: file.blob.mimeType,
      filename: file.name,
      rangeHeader: req.headers.get("range"),
      disposition: download ? "attachment" : "inline",
    });
  } catch (err) {
    return new Response("Erreur", { status: statusOf(err) });
  }
}
