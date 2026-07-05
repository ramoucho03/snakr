import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { listSharedWithUser } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { SharedGrid } from "@/components/drive/shared-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partagés avec moi" };

export default async function SharedWithMePage() {
  const user = await requireUser();
  const { files, folders } = await listSharedWithUser(user.id);
  const empty = files.length === 0 && folders.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/drive"
          className="inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
        >
          <ArrowLeft size={15} /> Retour au drive
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text-hi">Partagés avec moi</h1>
        <p className="text-sm text-text-lo">
          Fichiers et dossiers auxquels d'autres membres vous ont donné accès.
        </p>
      </div>

      {empty ? (
        <EmptyState
          icon={Users}
          title="Rien de partagé pour l'instant"
          description="Les fichiers et dossiers que d'autres membres partagent avec vous apparaîtront ici."
        />
      ) : (
        <SharedGrid folders={folders} files={files} />
      )}
    </div>
  );
}
