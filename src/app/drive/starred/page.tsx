import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { listStarredFiles } from "@/lib/files";
import { DriveView } from "@/components/drive/drive-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Favoris" };

/** Every starred file the user owns, across all folders. */
export default async function StarredPage() {
  const user = await requireUser();
  const files = await listStarredFiles(user.id);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-hi">
          Favoris
        </h1>
        <p className="mt-1 text-sm text-text-lo">
          Vos fichiers marqués d&apos;une étoile, tous dossiers confondus.
        </p>
      </header>
      <DriveView variant="starred" folderId={null} folders={[]} files={files} />
    </div>
  );
}
