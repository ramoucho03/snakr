import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { requireRead } from "@/lib/access";
import { listFolderContents } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { SharedGrid } from "@/components/drive/shared-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dossier partagé" };

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  // Access gate: READ (owned, or granted directly / by an ancestor). No access
  // is indistinguishable from "not found" to avoid leaking existence.
  try {
    await requireRead("FOLDER", folderId);
  } catch {
    notFound();
  }

  const contents = await listFolderContents(folderId);
  if (!contents) notFound();
  const empty = contents.folders.length === 0 && contents.files.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/drive/shared"
          className="inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
        >
          <ArrowLeft size={15} /> Partagés avec moi
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text-hi">{contents.name}</h1>
        <p className="text-sm text-text-lo">Consultation en lecture seule.</p>
      </div>

      {empty ? (
        <EmptyState icon={FolderOpen} title="Ce dossier est vide" />
      ) : (
        <SharedGrid folders={contents.folders} files={contents.files} showOwner={false} />
      )}
    </div>
  );
}
