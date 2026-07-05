import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { saveAvatar, saveBanner, removeAvatar, removeBanner } from "@/lib/avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MiB source cap (re-encoded far smaller)
const KINDS = ["avatar", "banner"] as const;
type Kind = (typeof KINDS)[number];

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

/** Upload (multipart `file`) a new avatar or banner for the signed-in user. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  if (!isKind(kind)) return Response.json({ error: "Type invalide" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Aucun fichier" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Le fichier doit être une image" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image trop lourde (max 15 Mo)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (kind === "avatar") await saveAvatar(user.id, buffer);
    else await saveBanner(user.id, buffer);
  } catch {
    return Response.json({ error: "Image illisible" }, { status: 422 });
  }
  return Response.json({ ok: true });
}

/** Remove the avatar or banner. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  if (!isKind(kind)) return Response.json({ error: "Type invalide" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  if (kind === "avatar") await removeAvatar(user.id);
  else await removeBanner(user.id);
  return Response.json({ ok: true });
}
