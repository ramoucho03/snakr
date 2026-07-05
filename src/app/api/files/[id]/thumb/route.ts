import type { NextRequest } from "next/server";
import { requireRead } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isPubliclyWatchable } from "@/lib/videos";
import { storage } from "@/lib/storage";
import { serveBlob } from "@/lib/http";
import { statusOf } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve the pre-generated WebP thumbnail; 404 lets the grid fall back to an icon. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    // Public/unlisted video thumbnails are visible on channel pages to anyone.
    if (!(await isPubliclyWatchable(id))) {
      await requireRead("FILE", id);
    }
    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        blob: {
          select: { derivatives: { where: { kind: "thumb" }, select: { key: true } } },
        },
      },
    });
    const key = file?.blob.derivatives[0]?.key;
    if (!key) return new Response(null, { status: 404 });

    const stat = await storage().stat(key);
    if (!stat) return new Response(null, { status: 404 });

    return await serveBlob({
      key,
      size: stat.size,
      mime: "image/webp",
      filename: "thumbnail.webp",
      rangeHeader: null,
      disposition: "inline",
      immutable: true,
    });
  } catch (err) {
    return new Response(null, { status: statusOf(err) });
  }
}
