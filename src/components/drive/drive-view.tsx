"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  FolderPlus,
  CloudUpload,
  Search,
  FolderOpen,
  Star,
  ArrowUpDown,
  LayoutGrid,
  List,
  Check,
  X,
  Trash2,
  FolderInput,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent, ModalClose } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { FileGrid, selKey, type GridCallbacks, type SelectionProps } from "./file-grid";
import { FileList } from "./file-list";
import { NewFolderDialog, RenameDialog, MoveDialog, ShareDialog } from "./dialogs";
import type { TargetItem } from "./types";
import type { FileDTO, FolderDTO } from "@/lib/files";
import type { PreviewFile } from "@/components/preview/preview-modal";
import { deleteAction, starAction, bulkDeleteAction } from "@/app/drive/actions";

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

type SortKey = "name" | "date" | "size";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "list";

const VIEW_LS = "snakr:drive:view";
const SORT_LS = "snakr:drive:sort";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Nom",
  date: "Date",
  size: "Taille",
};

export function DriveView({
  folderId,
  folders,
  files,
  variant = "folder",
}: {
  folderId: string | null;
  folders: FolderDTO[];
  files: FileDTO[];
  /** "starred" renders the Favoris flavour: no create/upload, no drop zone. */
  variant?: "folder" | "starred";
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

  // ── View + sort, persisted (hydrated post-mount to avoid SSR mismatch) ────
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  useEffect(() => {
    const v = localStorage.getItem(VIEW_LS);
    if (v === "list" || v === "grid") setView(v);
    try {
      const s = JSON.parse(localStorage.getItem(SORT_LS) ?? "");
      if (
        s &&
        ["name", "date", "size"].includes(s.key) &&
        ["asc", "desc"].includes(s.dir)
      ) {
        setSort(s);
      }
    } catch {
      // no stored preference
    }
  }, []);

  const changeView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_LS, v);
  };
  const changeSort = (patch: Partial<{ key: SortKey; dir: SortDir }>) => {
    setSort((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SORT_LS, JSON.stringify(next));
      return next;
    });
  };

  // ── Multi-selection ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const clearSelection = () => setSelected(new Set());
  // Navigating to another folder invalidates the selection.
  useEffect(clearSelection, [folderId]);

  const toggleSelect = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let fo = term ? folders.filter((f) => f.name.toLowerCase().includes(term)) : [...folders];
    let fi = term ? files.filter((f) => f.name.toLowerCase().includes(term)) : [...files];

    const mul = sort.dir === "asc" ? 1 : -1;
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) * mul;

    fo = fo.sort(
      sort.key === "date"
        ? (a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * mul
        : byName, // folders have no size — fall back to name
    );
    fi = fi.sort(
      sort.key === "date"
        ? (a, b) => (a.updatedAt.getTime() - b.updatedAt.getTime()) * mul
        : sort.key === "size"
          ? (a, b) => (a.size - b.size) * mul
          : byName,
    );
    return { folders: fo, files: fi };
  }, [q, folders, files, sort]);

  const selection: SelectionProps = {
    keys: selected,
    active: selected.size > 0,
    onToggle: toggleSelect,
  };

  const selectedTargets: TargetItem[] = useMemo(() => {
    const out: TargetItem[] = [];
    for (const f of folders) {
      if (selected.has(selKey("FOLDER", f.id))) out.push({ id: f.id, type: "FOLDER", name: f.name });
    }
    for (const f of files) {
      if (selected.has(selKey("FILE", f.id))) out.push({ id: f.id, type: "FILE", name: f.name });
    }
    return out;
  }, [selected, folders, files]);

  const selectAllVisible = () =>
    setSelected(
      new Set([
        ...visible.folders.map((f) => selKey("FOLDER", f.id)),
        ...visible.files.map((f) => selKey("FILE", f.id)),
      ]),
    );

  function confirmBulkDelete() {
    setBulkDeleting(true);
    bulkDeleteAction({ items: selectedTargets.map(({ id, type }) => ({ id, type })) }).then((r) => {
      setBulkDeleting(false);
      if (r.ok) {
        toast.success(
          `${r.deleted} élément${r.deleted > 1 ? "s" : ""} supprimé${r.deleted > 1 ? "s" : ""}` +
            (r.skipped > 0 ? ` (${r.skipped} ignoré${r.skipped > 1 ? "s" : ""})` : ""),
        );
        setBulkDeleteOpen(false);
        clearSelection();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  // ── Drop-anywhere upload (folder variant only) ─────────────────────────────
  const [dropHover, setDropHover] = useState(false);
  const dragDepth = useRef(0);
  const canDrop = variant === "folder";

  const hasDraggedFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  const dropZoneProps = canDrop
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasDraggedFiles(e)) return;
          e.preventDefault();
          dragDepth.current++;
          setDropHover(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (hasDraggedFiles(e)) e.preventDefault();
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropHover(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!hasDraggedFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDropHover(false);
          const dropped = Array.from(e.dataTransfer.files);
          if (dropped.length === 0) return;
          setUploadMounted(true);
          setUploadOpen(true);
          // Same chunk as the dialog — the singleton queue is shared.
          void import("./upload-dialog").then((m) => {
            const uppy = m.getUppy();
            try {
              uppy.addFiles(
                dropped.map((data) => ({
                  name: data.name,
                  type: data.type,
                  data,
                  meta: { folderId: folderId ?? "" },
                })),
              );
            } catch {
              // Restriction errors surface via the dialog's toast listener.
            }
            // Dropping on the drive = intent to send: start right away.
            void uppy.upload();
          });
        },
      }
    : {};

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
  const noMatch = !isEmpty && visible.folders.length === 0 && visible.files.length === 0;
  const starred = variant === "starred";

  return (
    <div className="relative flex flex-col gap-5" {...dropZoneProps}>
      {/* Full-surface drop target — shown only while dragging files over. */}
      {canDrop && dropHover && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-bg-0/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-glass-border bg-glass">
              <CloudUpload size={26} className="text-tan" aria-hidden />
            </span>
            <p className="font-display text-lg font-semibold text-text-hi">
              Déposez pour importer ici
            </p>
          </div>
        </div>
      )}

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
            placeholder={starred ? "Rechercher dans les favoris…" : "Rechercher dans ce dossier…"}
            className="h-11 rounded-full pl-11"
            aria-label="Rechercher"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="secondary" aria-label="Trier">
                <ArrowUpDown size={16} />
                <span className="hidden lg:inline">
                  {SORT_LABELS[sort.key]} {sort.dir === "asc" ? "↑" : "↓"}
                </span>
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownItem key={k} onSelect={() => changeSort({ key: k })}>
                  <Check size={16} className={cn(sort.key !== k && "invisible")} />
                  {SORT_LABELS[k]}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem onSelect={() => changeSort({ dir: "asc" })}>
                <Check size={16} className={cn(sort.dir !== "asc" && "invisible")} />
                Croissant
              </DropdownItem>
              <DropdownItem onSelect={() => changeSort({ dir: "desc" })}>
                <Check size={16} className={cn(sort.dir !== "desc" && "invisible")} />
                Décroissant
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>

          {/* View toggle */}
          <div className="flex items-center rounded-full border border-glass-border bg-glass p-0.5">
            <button
              type="button"
              onClick={() => changeView("grid")}
              aria-label="Vue grille"
              aria-pressed={view === "grid"}
              className={cn(
                "grid h-8 w-9 place-items-center rounded-full transition-colors",
                view === "grid" ? "bg-bg-1 text-text-hi" : "text-text-faint hover:text-text-hi",
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => changeView("list")}
              aria-label="Vue liste"
              aria-pressed={view === "list"}
              className={cn(
                "grid h-8 w-9 place-items-center rounded-full transition-colors",
                view === "list" ? "bg-bg-1 text-text-hi" : "text-text-faint hover:text-text-hi",
              )}
            >
              <List size={15} />
            </button>
          </div>

          {!starred && (
            <>
              <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus size={16} /> <span className="hidden sm:inline">Nouveau dossier</span>
              </Button>
              <Button onClick={openUpload}>
                <CloudUpload size={16} /> Importer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Bulk-action bar — replaces nothing, floats above the content flow. */}
      {selected.size > 0 && (
        <div className="glass-strong sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
          <p className="tabular px-1 text-sm font-medium text-text-hi">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={selectAllVisible}>
              <CheckSquare size={15} /> Tout sélectionner
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBulkMoveOpen(true)}>
              <FolderInput size={15} /> Déplacer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={15} /> Supprimer
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} aria-label="Annuler la sélection">
              <X size={15} />
            </Button>
          </div>
        </div>
      )}

      {isEmpty ? (
        starred ? (
          <EmptyState
            icon={Star}
            title="Aucun favori"
            description="Marquez des fichiers d'une étoile pour les retrouver ici en un clic."
          />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="Ce dossier est vide"
            description="Importez des fichiers (ou déposez-les n'importe où sur cette page) pour commencer."
            action={
              <Button onClick={openUpload}>
                <CloudUpload size={16} /> Importer des fichiers
              </Button>
            }
          />
        )
      ) : noMatch ? (
        <EmptyState icon={Search} title="Aucun résultat" description={`Rien ne correspond à « ${q} ».`} />
      ) : view === "list" ? (
        <FileList
          folders={visible.folders}
          files={visible.files}
          callbacks={callbacks}
          selection={selection}
        />
      ) : (
        <FileGrid
          folders={visible.folders}
          files={visible.files}
          callbacks={callbacks}
          selection={selection}
        />
      )}

      <NewFolderDialog folderId={folderId} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
      <RenameDialog item={renameItem} open={!!renameItem} onOpenChange={(o) => !o && setRenameItem(null)} />
      <MoveDialog item={moveItem} open={!!moveItem} onOpenChange={(o) => !o && setMoveItem(null)} />
      <MoveDialog
        item={null}
        items={selectedTargets}
        open={bulkMoveOpen}
        onOpenChange={setBulkMoveOpen}
        onMoved={clearSelection}
      />
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

      <Modal open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <ModalContent
          title={`Supprimer ${selected.size} élément${selected.size > 1 ? "s" : ""} ?`}
          description="Les éléments sélectionnés (et le contenu des dossiers) seront supprimés définitivement. Cette action est irréversible."
        >
          <div className="mt-5 flex justify-end gap-2">
            <ModalClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </ModalClose>
            <Button variant="danger" loading={bulkDeleting} onClick={confirmBulkDelete}>
              Tout supprimer
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
