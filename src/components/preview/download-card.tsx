"use client";

import {
  Download,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import type { PreviewKind } from "@/lib/mime";
import { formatBytes } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { PreviewFile } from "./preview-modal";

/**
 * The universal fallback: a glass card with a type icon, the file's metadata
 * and a prominent download link. Serves double duty as the `generic` viewer and
 * as the error/unsupported fallback for every other viewer, so a broken preview
 * can never blank the modal — the user always gets a way to grab the bytes.
 */
const ICONS: Record<PreviewKind, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  text: FileCode,
  markdown: FileText,
  docx: FileText,
  sheet: FileSpreadsheet,
  generic: File,
};

export function DownloadCard({
  file,
  reason,
}: {
  file: PreviewFile;
  reason?: string;
}) {
  const Icon = ICONS[file.kind] ?? File;
  return (
    <div className="grid h-full w-full place-items-center p-6">
      <GlassCard
        strong
        sheen
        className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center"
      >
        <div className="glass grid h-20 w-20 place-items-center rounded-2xl">
          <Icon size={36} className="text-accent" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-display break-all text-lg font-semibold text-text-hi">
            {file.name}
          </p>
          <p className="text-sm text-text-lo">
            {formatBytes(file.size)}
            {file.mime ? ` · ${file.mime}` : ""}
          </p>
          {reason && <p className="mt-1 text-sm text-text-faint">{reason}</p>}
        </div>
        <a
          href={`/api/files/${file.id}?dl=1`}
          download
          className={buttonClass({ variant: "primary", size: "md", className: "mt-1" })}
        >
          <Download size={16} aria-hidden />
          Télécharger
        </a>
      </GlassCard>
    </div>
  );
}
