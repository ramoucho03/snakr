"use client";

import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  MoreVertical,
  Folder,
  Star,
  Download,
  Pencil,
  FolderInput,
  Share2,
  Trash2,
  Eye,
  FolderOpen,
  PlayCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { formatBytes, cn } from "@/lib/utils";
import type { FileDTO, FolderDTO } from "@/lib/files";
import { TypeIcon } from "./type-icon";
import type { TargetItem } from "./types";

export interface GridCallbacks {
  onOpenFolder: (id: string) => void;
  onPreview: (file: FileDTO) => void;
  onWatch: (fileId: string) => void;
  onDownload: (fileId: string) => void;
  onStar: (fileId: string) => void;
  onRename: (item: TargetItem) => void;
  onMove: (item: TargetItem) => void;
  onShare: (item: TargetItem) => void;
  onDelete: (item: TargetItem) => void;
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 26 } },
};

export function FileGrid({
  folders,
  files,
  callbacks,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  callbacks: GridCallbacks;
}) {
  const reduce = useReducedMotion();
  const anim = reduce
    ? {}
    : { variants: container, initial: "hidden" as const, animate: "show" as const };

  return (
    <motion.div
      {...anim}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {folders.map((f) => (
        <FolderCard key={f.id} folder={f} callbacks={callbacks} reduce={reduce} />
      ))}
      {files.map((f) => (
        <FileCard key={f.id} file={f} callbacks={callbacks} reduce={reduce} />
      ))}
    </motion.div>
  );
}

function CardMenu({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute right-2 top-2 z-10"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            className="grid h-8 w-8 place-items-center rounded-full bg-bg-0/50 text-text-lo opacity-0 backdrop-blur transition-all hover:text-text-hi focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
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

function FolderCard({
  folder,
  callbacks,
  reduce,
}: {
  folder: FolderDTO;
  callbacks: GridCallbacks;
  reduce: boolean | null;
}) {
  const target: TargetItem = { id: folder.id, type: "FOLDER", name: folder.name };
  const count = folder.fileCount + folder.subfolderCount;
  return (
    <motion.div variants={reduce ? undefined : item} className="group relative">
      <button
        onClick={() => callbacks.onOpenFolder(folder.id)}
        onDoubleClick={() => callbacks.onOpenFolder(folder.id)}
        className="glass flex w-full flex-col gap-3 rounded-xl p-3.5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-tan/25 hover:brightness-105 hover:shadow-[0_18px_44px_-22px_rgba(0,0,0,0.7)]"
      >
        <div className="flex h-20 items-center justify-center rounded-lg bg-linear-to-br from-bg-1/50 to-transparent ring-1 ring-inset ring-glass-border/60 transition-transform duration-200 group-hover:scale-[1.03]">
          <Folder
            size={42}
            className={cn("drop-shadow", !folder.color && "text-tan")}
            style={folder.color ? { color: folder.color } : undefined}
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-hi">{folder.name}</p>
          <p className="text-xs text-text-faint">
            {count === 0 ? "Vide" : `${count} élément${count > 1 ? "s" : ""}`}
          </p>
        </div>
      </button>
      <CardMenu>
        <DropdownItem onSelect={() => callbacks.onOpenFolder(folder.id)}>
          <FolderOpen size={16} /> Ouvrir
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onShare(target)}>
          <Share2 size={16} /> Partager
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onRename(target)}>
          <Pencil size={16} /> Renommer
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onMove(target)}>
          <FolderInput size={16} /> Déplacer
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger onSelect={() => callbacks.onDelete(target)}>
          <Trash2 size={16} /> Supprimer
        </DropdownItem>
      </CardMenu>
    </motion.div>
  );
}

function FileCard({
  file,
  callbacks,
  reduce,
}: {
  file: FileDTO;
  callbacks: GridCallbacks;
  reduce: boolean | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const target: TargetItem = { id: file.id, type: "FILE", name: file.name };
  const showThumb = file.hasThumb && !imgFailed;

  return (
    <motion.div variants={reduce ? undefined : item} className="group relative">
      <button
        onClick={() => callbacks.onPreview(file)}
        className="glass flex w-full flex-col gap-3 rounded-xl p-3.5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-tan/25 hover:brightness-105 hover:shadow-[0_18px_44px_-22px_rgba(0,0,0,0.7)]"
      >
        <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg bg-bg-1/60 ring-1 ring-inset ring-glass-border/60">
          {showThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${file.id}/thumb`}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <TypeIcon kind={file.kind} size={34} className="transition-transform duration-200 group-hover:scale-110" />
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-medium text-text-hi">
            {file.starred && <Star size={12} className="shrink-0 fill-warning text-warning" />}
            <span className="truncate">{file.name}</span>
          </p>
          <p className="tabular text-xs text-text-faint">{formatBytes(file.size)}</p>
        </div>
      </button>
      <CardMenu>
        {file.kind === "video" && (
          <DropdownItem onSelect={() => callbacks.onWatch(file.id)}>
            <PlayCircle size={16} /> Regarder
          </DropdownItem>
        )}
        <DropdownItem onSelect={() => callbacks.onPreview(file)}>
          <Eye size={16} /> Aperçu
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onDownload(file.id)}>
          <Download size={16} /> Télécharger
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onStar(file.id)}>
          <Star size={16} /> {file.starred ? "Retirer des favoris" : "Ajouter aux favoris"}
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onShare(target)}>
          <Share2 size={16} /> Partager
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onRename(target)}>
          <Pencil size={16} /> Renommer
        </DropdownItem>
        <DropdownItem onSelect={() => callbacks.onMove(target)}>
          <FolderInput size={16} /> Déplacer
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger onSelect={() => callbacks.onDelete(target)}>
          <Trash2 size={16} /> Supprimer
        </DropdownItem>
      </CardMenu>
    </motion.div>
  );
}
