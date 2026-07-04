import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { resolveShare, claimDownload } from "@/lib/share";
import { getFileRecord } from "@/lib/files";
import { serveBlob, parseRange } from "@/lib/http";
import { blobKey } from "@/lib/storage";
import { isProd } from "@/lib/env";
import {
  SHARE_GRANT_COOKIE,
  verifyShareGrant,
  DL_PROGRESS_COOKIE,
  signDownloadProgress,
  verifyDownloadProgress,
} from "@/lib/share-grant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is `fileId` the shared file, or (for folder shares) inside the shared subtree? */
async function fileAllowed(
  fileId: string,
  share: { fileId: string | null; folderId: string | null },
): Promise<boolean> {
  if (share.fileId) return fileId === share.fileId;
  if (!share.folderId) return false;
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { folderId: true, folder: { select: { path: true } } },
  });
  if (!file) return false;
  if (file.folderId === share.folderId) return true;
  return (file.folder?.path.split("/").filter(Boolean) ?? []).includes(share.folderId);
}

/**
 * Public download for a share link. Re-validates the token every time (revoked /
 * expired / exhausted), enforces the unlock grant for password shares, and
 * claims one download atomically before serving a single byte.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const state = await resolveShare(token);

  if (state.status === "invalid") return new Response("Lien invalide", { status: 404 });
  if (state.status === "revoked" || state.status === "expired" || state.status === "exhausted") {
    return new Response("Lien expiré", { status: 410 });
  }

  const share = state.share;

  if (share.hasPassword) {
    const grant = (await cookies()).get(SHARE_GRANT_COOKIE)?.value;
    if (!(await verifyShareGrant(grant, share.id))) {
      return new Response("Déverrouillage requis", { status: 403 });
    }
  }

  const requested = req.nextUrl.searchParams.get("file");
  const fileId = share.fileId ?? requested;
  if (!fileId) return new Response("Fichier non spécifié", { status: 400 });
  if (!(await fileAllowed(fileId, share))) {
    return new Response("Accès refusé", { status: 403 });
  }

  const file = await getFileRecord(fileId);
  if (!file) return new Response("Introuvable", { status: 404 });

  // A "download" is claimed exactly once, on the initial served request. We
  // decide initial-vs-continuation from the PARSED range start (not the raw
  // header string), so a crafted `bytes=1-` or suffix `bytes=-N` can't slip
  // content past the atomic maxDownloads claim. Continuations (start > 0) are
  // only served when they carry the signed progress marker from that first hit.
  const range = req.headers.get("range");
  const size = Number(file.blob.size);
  const parsed = parseRange(range, size);

  // An unsatisfiable range must 416 WITHOUT consuming a download (otherwise a
  // stream of bad ranges could burn a limited share's quota to exhaustion).
  if (range && !parsed) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  const isContinuation = parsed !== null && parsed.start > 0;
  const jar = await cookies();

  if (isContinuation) {
    const marker = jar.get(DL_PROGRESS_COOKIE)?.value;
    if (!(await verifyDownloadProgress(marker, share.id, fileId))) {
      return new Response("Accès refusé", { status: 403 });
    }
  } else {
    if (!(await claimDownload(share.id))) {
      return new Response("Quota de téléchargements atteint", { status: 410 });
    }
    jar.set(DL_PROGRESS_COOKIE, await signDownloadProgress(share.id, fileId), {
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });
  }

  return await serveBlob({
    key: blobKey(file.blob.hash),
    size: Number(file.blob.size),
    mime: file.blob.mimeType,
    filename: file.name,
    rangeHeader: range,
    disposition: "attachment",
  });
}
