import type { NextRequest } from "next/server";
import { serveDerivative } from "@/lib/serve-derivative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The 1280×720 still. This is the `og:image` a social network fetches when
 * somebody pastes a /watch link, so it is generated on first request rather
 * than eagerly for every upload. Same ACL as the video it comes from.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return serveDerivative(id, "poster", {
    rangeHeader: null,
    ifNoneMatch: req.headers.get("if-none-match"),
  });
}
