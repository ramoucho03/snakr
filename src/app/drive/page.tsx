import { requireUser } from "@/lib/dal";
import { listFolder } from "@/lib/files";
import { Breadcrumbs } from "@/components/drive/breadcrumbs";
import { DriveView } from "@/components/drive/drive-view";

export const dynamic = "force-dynamic";

export default async function DrivePage() {
  const user = await requireUser();
  const { folders, files } = await listFolder(user.id, null);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs crumbs={[]} />
      <DriveView folderId={null} folders={folders} files={files} />
    </div>
  );
}
