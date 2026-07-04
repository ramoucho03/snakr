import { cookies } from "next/headers";
import Link from "next/link";
import { Download, FileWarning, FolderOpen } from "lucide-react";
import { resolveShare } from "@/lib/share";
import { SHARE_GRANT_COOKIE, verifyShareGrant } from "@/lib/share-grant";
import { prisma } from "@/lib/db";
import { previewKindOf } from "@/lib/mime";
import { formatBytes } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { GlassCard } from "@/components/ui/glass-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TypeIcon } from "@/components/drive/type-icon";
import { UnlockForm } from "./unlock-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partage" };

// Primary-button look as a plain string (buttonClass lives in a "use client"
// module and can't be called from this server component).
const CTA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-medium " +
  "text-[var(--accent-contrast)] shadow-[0_8px_24px_-8px_var(--accent)] transition hover:brightness-110";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Snak'r">
          <Logo size={30} />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <GlassCard strong className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-danger/10">
        <FileWarning size={26} className="text-danger" />
      </div>
      <h1 className="font-display text-xl font-semibold text-text-hi">{title}</h1>
      <p className="max-w-sm text-sm text-text-lo">{message}</p>
      <Link href="/" className="mt-2 text-sm text-accent hover:underline">
        Retour à l'accueil
      </Link>
    </GlassCard>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await resolveShare(token);

  if (state.status === "invalid")
    return <Shell><ErrorCard title="Lien invalide" message="Ce lien de partage n'existe pas." /></Shell>;
  if (state.status === "revoked")
    return <Shell><ErrorCard title="Lien révoqué" message="Le propriétaire a désactivé ce lien." /></Shell>;
  if (state.status === "expired")
    return <Shell><ErrorCard title="Lien expiré" message="Ce lien de partage a expiré." /></Shell>;
  if (state.status === "exhausted")
    return <Shell><ErrorCard title="Quota atteint" message="Le nombre maximal de téléchargements a été atteint." /></Shell>;

  const share = state.share;

  // Locked share: allow through only with a valid unlock grant cookie.
  if (state.status === "password") {
    const grant = (await cookies()).get(SHARE_GRANT_COOKIE)?.value;
    if (!(await verifyShareGrant(grant, share.id))) {
      return (
        <Shell>
          <GlassCard strong>
            <UnlockForm token={token} />
          </GlassCard>
        </Shell>
      );
    }
  }

  // Single-file share.
  if (share.file) {
    const kind = previewKindOf(share.file.mime, share.file.name);
    return (
      <Shell>
        <GlassCard strong className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-glass">
            <TypeIcon kind={kind} size={30} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-text-hi break-words">
              {share.file.name}
            </h1>
            <p className="tabular mt-1 text-sm text-text-lo">{formatBytes(share.file.size)}</p>
          </div>
          {share.note && <p className="max-w-sm text-sm text-text-lo">« {share.note} »</p>}
          <a href={`/api/s/${token}`} download className={CTA}>
            <Download size={18} /> Télécharger
          </a>
        </GlassCard>
      </Shell>
    );
  }

  // Folder share — list the files directly inside it.
  if (share.folderId) {
    const files = await prisma.file.findMany({
      where: { folderId: share.folderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, blob: { select: { size: true, mimeType: true } } },
    });
    return (
      <Shell>
        <div className="w-full max-w-2xl">
          <GlassCard strong className="mb-4 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-glass">
              <FolderOpen size={22} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-lg font-semibold text-text-hi">
                {share.folder?.name ?? "Dossier partagé"}
              </h1>
              <p className="text-sm text-text-lo">
                {files.length} fichier{files.length > 1 ? "s" : ""}
                {share.note ? ` · « ${share.note} »` : ""}
              </p>
            </div>
          </GlassCard>
          {files.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-faint">Ce dossier est vide.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {files.map((f) => (
                <a
                  key={f.id}
                  href={`/api/s/${token}?file=${f.id}`}
                  download
                  className="glass flex items-center gap-3 rounded-xl p-3 transition-transform hover:-translate-y-0.5 hover:brightness-110"
                >
                  <TypeIcon kind={previewKindOf(f.blob.mimeType, f.name)} size={22} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-hi">{f.name}</span>
                  <span className="tabular text-xs text-text-faint">{formatBytes(Number(f.blob.size))}</span>
                  <Download size={16} className="text-text-lo" />
                </a>
              ))}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  return <Shell><ErrorCard title="Rien à afficher" message="Ce partage ne contient aucun élément." /></Shell>;
}
