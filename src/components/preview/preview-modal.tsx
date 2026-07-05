"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { Download, X } from "lucide-react";
import type { PreviewKind } from "@/lib/mime";
import { formatBytes } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { PreviewRouter } from "./preview-router";

/**
 * Full-screen glass preview modal. Built on @radix-ui/react-dialog for focus
 * trapping, Escape handling and body-scroll lock; a Motion entrance gives the
 * panel a subtle scale/fade. The body dispatches to a lazily-loaded viewer via
 * <PreviewRouter> so each file kind only pulls in the code it needs.
 *
 * Bytes are served by the authenticated routes:
 *   GET /api/files/{id}        → inline (Range-aware) — the viewer source
 *   GET /api/files/{id}?dl=1    → attachment — the Télécharger link
 */
export interface PreviewFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: PreviewKind;
}

export function PreviewModal({
  file,
  onClose,
}: {
  file: PreviewFile | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();

  if (!file) return null;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-90 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[fadeIn_.15s_ease]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-100 grid place-items-center p-3 focus:outline-none sm:p-6"
          // Click on the padding (the backdrop area) closes; clicks that land on
          // the panel or its children don't bubble here as currentTarget.
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="glass-strong glass-sheen flex h-full max-h-[92vh] w-full max-w-350 flex-col overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-glass-border px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-col">
                <Dialog.Title className="font-display truncate text-base font-semibold text-text-hi sm:text-lg">
                  {file.name}
                </Dialog.Title>
                <span className="text-xs text-text-faint tabular">
                  {formatBytes(file.size)}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <a
                  href={`/api/files/${file.id}?dl=1`}
                  download
                  className={buttonClass({
                    variant: "secondary",
                    size: "sm",
                    className: "h-10 min-w-10 justify-center sm:h-8 sm:min-w-0",
                  })}
                >
                  <Download size={15} aria-hidden />
                  <span className="hidden sm:inline">Télécharger</span>
                </a>
                <Dialog.Close
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-faint transition-colors hover:bg-glass hover:text-text-hi sm:h-9 sm:w-9"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </Dialog.Close>
              </div>
            </div>

            {/* Body — the dispatched viewer. `key` remounts on file change so no
                per-file viewer state (zoom, load error, page count) leaks across. */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <PreviewRouter key={file.id} file={file} />
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
