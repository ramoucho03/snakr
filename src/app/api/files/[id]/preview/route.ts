import type { NextRequest } from "next/server";
import { serveDerivative } from "@/lib/serve-derivative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The ~6-second silent hover clip. Streaming the source for a hover costs
 * megabytes off a home uplink; this is a couple hundred kilobytes. Range-aware
 * because Safari will not play a video it cannot seek.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return serveDerivative(id, "preview", {
    rangeHeader: req.headers.get("range"),
    ifNoneMatch: req.headers.get("if-none-match"),
  });
}
