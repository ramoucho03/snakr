import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { listFolder, breadcrumbs } from "@/lib/files";
import { Breadcrumbs } from "@/components/drive/breadcrumbs";
import { DriveView } from "@/components/drive/drive-view";

export const dynamic = "force-dynamic";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const user = await requireUser();

  // Ownership check → 404 for anything not the user's own folder.
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: user.id },
    select: { id: true },
  });
  if (!folder) notFound();

  const [{ folders, files }, crumbs] = await Promise.all([
    listFolder(user.id, folderId),
    breadcrumbs(folderId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs crumbs={crumbs} />
      <DriveView folderId={folderId} folders={folders} files={files} />
    </div>
  );
}
