import type { NextRequest } from "next/server";
import { requireRead } from "@/lib/access";
import { incrementView, isPubliclyWatchable } from "@/lib/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register a view. Called once per session by the player after playback truly
 * starts (the client debounces). Allowed for anyone who can watch the video —
 * public/unlisted anonymously, otherwise a reader. Always 204, never an error.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    if (!(await isPubliclyWatchable(id))) {
      await requireRead("FILE", id);
    }
    await incrementView(id);
  } catch {
    /* not watchable by this caller — silently ignore */
  }
  return new Response(null, { status: 204 });
}
