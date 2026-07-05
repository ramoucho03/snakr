"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Folder, Download, Eye, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/dropdown";
import { formatBytes, cn } from "@/lib/utils";
import { TypeIcon } from "./type-icon";
import type { SharedFileDTO, SharedFolderDTO } from "@/lib/permissions";
import type { PreviewFile } from "@/components/preview/preview-modal";

const PreviewModal = dynamic(
  () => import("@/components/preview/preview-modal").then((m) => m.PreviewModal),
  { ssr: false },
);

function LevelBadge({ level }: { level: string }) {
  const label = level === "OWNER" ? "Propriétaire" : level === "WRITE" ? "Écriture" : "Lecture";
  return (
    <span className="rounded-full bg-glass px-2 py-0.5 text-[10px] font-medium text-text-lo">
      {label}
    </span>
  );
}

/** Read-only grid for items shared with the current user (preview + download). */
export function SharedGrid({
  folders,
  files,
  folderHrefBase = "/drive/shared",
  showOwner = true,
}: {
  folders: SharedFolderDTO[];
  files: SharedFileDTO[];
  folderHrefBase?: string;
  showOwner?: boolean;
}) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => router.push(`${folderHrefBase}/${f.id}`)}
            className="glass flex flex-col gap-3 rounded-xl p-3.5 text-left transition-transform hover:-translate-y-0.5 hover:brightness-110"
          >
            <div className="flex h-20 items-center justify-center">
              <Folder
                size={44}
                className={cn("drop-shadow", !f.color && "text-accent")}
                style={f.color ? { color: f.color } : undefined}
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-hi">{f.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <LevelBadge level={f.level} />
                {showOwner && <span className="truncate text-xs text-text-faint">{f.ownerName}</span>}
              </div>
            </div>
          </button>
        ))}

        {files.map((f) => {
          const showThumb = f.hasThumb && !imgFailed[f.id];
          return (
            <div key={f.id} className="group relative">
              <button
                onClick={() =>
                  setPreview({ id: f.id, name: f.name, mime: f.mime, size: f.size, kind: f.kind })
                }
                className="glass flex w-full flex-col gap-3 rounded-xl p-3.5 text-left transition-transform hover:-translate-y-0.5 hover:brightness-110"
              >
                <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg bg-bg-1/60">
                  {showThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/files/${f.id}/thumb`}
                      alt=""
                      loading="lazy"
                      onError={() => setImgFailed((s) => ({ ...s, [f.id]: true }))}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <TypeIcon kind={f.kind} size={34} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-hi">{f.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="tabular text-xs text-text-faint">{formatBytes(f.size)}</span>
                    {showOwner && (
                      <span className="truncate text-xs text-text-faint">· {f.ownerName}</span>
                    )}
                  </div>
                </div>
              </button>
              <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <button
                      className="grid h-10 w-10 place-items-center rounded-full bg-bg-0/50 text-text-lo opacity-100 backdrop-blur transition-all hover:text-text-hi data-[state=open]:opacity-100 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem
                      onSelect={() =>
                        setPreview({ id: f.id, name: f.name, mime: f.mime, size: f.size, kind: f.kind })
                      }
                    >
                      <Eye size={16} /> Aperçu
                    </DropdownItem>
                    <DropdownItem onSelect={() => (window.location.href = `/api/files/${f.id}?dl=1`)}>
                      <Download size={16} /> Télécharger
                    </DropdownItem>
                  </DropdownContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
      <PreviewModal file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
