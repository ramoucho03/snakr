import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { listSharesFor } from "@/lib/share";
import { SharesList, type ShareRow } from "@/components/drive/shares-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes partages" };

export default async function SharesPage() {
  const user = await requireUser();
  const raw = await listSharesFor(user.id);

  const shares: ShareRow[] = raw.map((s) => ({
    id: s.id,
    note: s.note,
    targetName: s.file?.name ?? s.folder?.name ?? "élément supprimé",
    targetType: s.file ? "FILE" : s.folder ? "FOLDER" : "UNKNOWN",
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    maxDownloads: s.maxDownloads,
    downloadCount: s.downloadCount,
    revoked: Boolean(s.revokedAt),
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/drive"
          className="inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
        >
          <ArrowLeft size={15} /> Retour au drive
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text-hi">Mes partages</h1>
        <p className="text-sm text-text-lo">
          Les liens ne sont affichés qu'à la création. Révoquez-en un à tout moment.
        </p>
      </div>
      <SharesList shares={shares} />
    </div>
  );
}
