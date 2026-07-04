import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { tusServer, runWithUser } from "@/lib/tus";

// tus streams multi-GB bodies chunk by chunk — must run on Node, never edge,
// and never be statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HandleWebArg = Parameters<ReturnType<typeof tusServer>["handleWeb"]>[0];

/**
 * Catch-all tus endpoint (POST create, PATCH append, HEAD offset, DELETE
 * terminate). Authentication happens here — in the DAL — before any bytes are
 * accepted; the user id is then carried into the tus callbacks via ALS.
 */
async function handle(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Non authentifié", { status: 401 });
  }
  return runWithUser(user.id, () =>
    tusServer().handleWeb(req as unknown as HandleWebArg),
  );
}

export const POST = handle;
export const PATCH = handle;
export const HEAD = handle;
export const DELETE = handle;
export const GET = handle;

// OPTIONS is a capability preflight — answer it without requiring a session so
// the tus client can negotiate before the first authenticated PATCH.
export async function OPTIONS(req: NextRequest): Promise<Response> {
  return tusServer().handleWeb(req as unknown as HandleWebArg);
}
