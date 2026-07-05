"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FolderPlus, CloudUpload, Search, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent, ModalClose } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { FileGrid, type GridCallbacks } from "./file-grid";
import { NewFolderDialog, RenameDialog, MoveDialog, ShareDialog } from "./dialogs";
import type { TargetItem } from "./types";
import type { FileDTO, FolderDTO } from "@/lib/files";
import type { PreviewFile } from "@/components/preview/preview-modal";
import { deleteAction, starAction } from "@/app/drive/actions";

// Heavy, browser-only trees — loaded on demand, never server-rendered.
const UploadDialog = dynamic(() => import("./upload-dialog").then((m) => m.UploadDialog), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center py-10">
      <Spinner />
    </div>
  ),
});
const PreviewModal = dynamic(
  () => import("@/components/preview/preview-modal").then((m) => m.PreviewModal),
  { ssr: false },
);

export function DriveView({
  folderId,
  folders,
  files,
}: {
  folderId: string | null;
  folders: FolderDTO[];
  files: FileDTO[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Once opened, the uploader stays MOUNTED (just hidden on close) so closing
  // the dialog never tears down Uppy and its in-flight tus uploads.
  const [uploadMounted, setUploadMounted] = useState(false);
  const openUpload = () => {
    setUploadMounted(true);
    setUploadOpen(true);
  };
  const [renameItem, setRenameItem] = useState<TargetItem | null>(null);
  const [moveItem, setMoveItem] = useState<TargetItem | null>(null);
  const [shareItem, setShareItem] = useState<TargetItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<TargetItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { folders, files };
    return {
      folders: folders.filter((f) => f.name.toLowerCase().includes(term)),
      files: files.filter((f) => f.name.toLowerCase().includes(term)),
    };
  }, [q, folders, files]);

  const callbacks: GridCallbacks = {
    onOpenFolder: (id) => router.push(`/drive/${id}`),
    onPreview: (f) =>
      setPreview({ id: f.id, name: f.name, mime: f.mime, size: f.size, kind: f.kind }),
    onWatch: (id) => router.push(`/videos/${id}`),
    onDownload: (id) => {
      window.location.href = `/api/files/${id}?dl=1`;
    },
    onStar: (id) =>
      starAction({ fileId: id }).then((r) => (r.ok ? router.refresh() : toast.error(r.error))),
    onRename: setRenameItem,
    onMove: setMoveItem,
    onShare: setShareItem,
    onDelete: setDeleteItem,
  };

  function confirmDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    deleteAction({ id: deleteItem.id, type: deleteItem.type }).then((r) => {
      setDeleting(false);
      if (r.ok) {
        toast.success("Supprimé");
        setDeleteItem(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const isEmpty = folders.length === 0 && files.length === 0;
  const noMatch = !isEmpty && filtered.folders.length === 0 && filtered.files.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full min-w-48 max-w-sm sm:w-auto sm:flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher dans ce dossier…"
            className="h-11 rounded-full pl-11"
            aria-label="Rechercher"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus size={16} /> <span className="hidden sm:inline">Nouveau dossier</span>
          </Button>
          <Button onClick={openUpload}>
            <CloudUpload size={16} /> Importer
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={FolderOpen}
          title="Ce dossier est vide"
          description="Importez des fichiers ou créez un dossier pour commencer."
          action={
            <Button onClick={openUpload}>
              <CloudUpload size={16} /> Importer des fichiers
            </Button>
          }
        />
      ) : noMatch ? (
        <EmptyState icon={Search} title="Aucun résultat" description={`Rien ne correspond à « ${q} ».`} />
      ) : (
        <FileGrid folders={filtered.folders} files={filtered.files} callbacks={callbacks} />
      )}

      <NewFolderDialog folderId={folderId} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
      <RenameDialog item={renameItem} open={!!renameItem} onOpenChange={(o) => !o && setRenameItem(null)} />
      <MoveDialog item={moveItem} open={!!moveItem} onOpenChange={(o) => !o && setMoveItem(null)} />
      <ShareDialog item={shareItem} open={!!shareItem} onOpenChange={(o) => !o && setShareItem(null)} />
      {uploadMounted && (
        <UploadDialog folderId={folderId} open={uploadOpen} onOpenChange={setUploadOpen} />
      )}
      <PreviewModal file={preview} onClose={() => setPreview(null)} />

      <Modal open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <ModalContent
          title="Supprimer ?"
          description={
            deleteItem
              ? `« ${deleteItem.name} » sera supprimé définitivement. Cette action est irréversible.`
              : undefined
          }
        >
          <div className="mt-5 flex justify-end gap-2">
            <ModalClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </ModalClose>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Supprimer
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
