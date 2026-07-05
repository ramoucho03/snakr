import type { NextRequest } from "next/server";
import { getProfileAsset } from "@/lib/avatar";
import { serveStoredImage } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public avatar bytes (shown on channel pages, comments, watch headers). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const key = await getProfileAsset(id, "avatar");
  return serveStoredImage(key, req.headers.get("if-none-match"));
}
