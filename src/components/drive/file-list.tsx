"use client";

import { useState } from "react";
import { MoreVertical, Folder, Star, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
} from "@/components/ui/dropdown";
import { formatBytes, formatRelative, cn } from "@/lib/utils";
import type { FileDTO, FolderDTO } from "@/lib/files";
import { TypeIcon } from "./type-icon";
import {
  FileMenuItems,
  FolderMenuItems,
  selKey,
  type GridCallbacks,
  type SelectionProps,
} from "./file-grid";

/**
 * Dense list view — same data, callbacks and selection wiring as FileGrid,
 * rendered as scannable rows (name / size / modified) for large folders.
 */
export function FileList({
  folders,
  files,
  callbacks,
  selection,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  callbacks: GridCallbacks;
  selection?: SelectionProps;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-glass-border bg-glass/40">
      {/* Column header */}
      <div className="hidden items-center gap-3 border-b border-glass-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-text-faint sm:flex">
        <span className="w-6" />
        <span className="w-9" />
        <span className="min-w-0 flex-1">Nom</span>
        <span className="w-24 text-right">Taille</span>
        <span className="hidden w-32 text-right md:block">Modifié</span>
        <span className="w-9" />
      </div>

      <ul className="divide-y divide-glass-border/60">
        {folders.map((f) => (
          <FolderRow key={f.id} folder={f} callbacks={callbacks} selection={selection} />
        ))}
        {files.map((f) => (
          <FileRow key={f.id} file={f} callbacks={callbacks} selection={selection} />
        ))}
      </ul>
    </div>
  );
}

function RowCheck({
  checked,
  active,
  onToggle,
  label,
}: {
  checked: boolean;
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={checked ? `Désélectionner ${label}` : `Sélectionner ${label}`}
      aria-pressed={checked}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-all",
        checked
          ? "border-accent bg-accent text-(--accent-contrast) opacity-100"
          : "border-glass-border text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        active && "opacity-100",
      )}
    >
      <Check size={14} aria-hidden />
    </button>
  );
}

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            className="grid h-9 w-9 place-items-center rounded-full text-text-faint transition-colors hover:bg-glass-strong hover:text-text-hi"
            aria-label="Actions"
          >
            <MoreVertical size={16} />
          </button>
        </DropdownTrigger>
        <DropdownContent>{children}</DropdownContent>
      </DropdownMenu>
    </div>
  );
}

const rowClass = (checked: boolean) =>
  cn(
    "group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-glass",
    checked && "bg-accent/10 hover:bg-accent/15",
  );

function FolderRow({
  folder,
  callbacks,
  selection,
}: {
  folder: FolderDTO;
  callbacks: GridCallbacks;
  selection?: SelectionProps;
}) {
  const key = selKey("FOLDER", folder.id);
  const checked = selection?.keys.has(key) ?? false;
  const count = folder.fileCount + folder.subfolderCount;
  return (
    <li
      className={rowClass(checked)}
      onClick={() =>
        selection?.active ? selection.onToggle(key) : callbacks.onOpenFolder(folder.id)
      }
    >
      {selection ? (
        <RowCheck
          checked={checked}
          active={selection.active}
          onToggle={() => selection.onToggle(key)}
          label={folder.name}
        />
      ) : (
        <span className="w-6" />
      )}
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-1/60 ring-1 ring-inset ring-glass-border/60">
        <Folder
          size={18}
          className={cn(!folder.color && "text-tan")}
          style={folder.color ? { color: folder.color } : undefined}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-hi">{folder.name}</span>
        <span className="block text-xs text-text-faint sm:hidden">
          {count === 0 ? "Vide" : `${count} élément${count > 1 ? "s" : ""}`}
        </span>
      </span>
      <span className="tabular hidden w-24 shrink-0 text-right text-xs text-text-faint sm:block">
        {count === 0 ? "—" : `${count} élém.`}
      </span>
      <span className="tabular hidden w-32 shrink-0 text-right text-xs text-text-faint md:block">
        {formatRelative(folder.createdAt)}
      </span>
      <RowMenu>
        <FolderMenuItems folder={folder} callbacks={callbacks} />
      </RowMenu>
    </li>
  );
}

function FileRow({
  file,
  callbacks,
  selection,
}: {
  file: FileDTO;
  callbacks: GridCallbacks;
  selection?: SelectionProps;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const key = selKey("FILE", file.id);
  const checked = selection?.keys.has(key) ?? false;
  const showThumb = file.hasThumb && !imgFailed;

  return (
    <li
      className={rowClass(checked)}
      onClick={() =>
        selection?.active ? selection.onToggle(key) : callbacks.onPreview(file)
      }
    >
      {selection ? (
        <RowCheck
          checked={checked}
          active={selection.active}
          onToggle={() => selection.onToggle(key)}
          label={file.name}
        />
      ) : (
        <span className="w-6" />
      )}
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-bg-1/60 ring-1 ring-inset ring-glass-border/60">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${file.id}/thumb`}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <TypeIcon kind={file.kind} size={17} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {file.starred && (
            <Star size={12} className="shrink-0 fill-warning text-warning" aria-hidden />
          )}
          <span className="truncate text-sm font-medium text-text-hi">{file.name}</span>
        </span>
        <span className="tabular block text-xs text-text-faint sm:hidden">
          {formatBytes(file.size)}
        </span>
      </span>
      <span className="tabular hidden w-24 shrink-0 text-right text-xs text-text-faint sm:block">
        {formatBytes(file.size)}
      </span>
      <span className="tabular hidden w-32 shrink-0 text-right text-xs text-text-faint md:block">
        {formatRelative(file.updatedAt)}
      </span>
      <RowMenu>
        <FileMenuItems file={file} callbacks={callbacks} />
      </RowMenu>
    </li>
  );
}
