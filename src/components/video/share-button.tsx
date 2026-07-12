"use client";

import { useState } from "react";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { copyText, nativeShare } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * Share a public link. On a phone this opens the OS share sheet — the one place
 * people's messaging apps actually live. Everywhere else it falls back to a
 * modal with a copyable field, which is also where a dismissed sheet leaves you.
 *
 * The modal is controlled rather than trigger-driven because `navigator.share()`
 * has to be reached synchronously inside the click handler; a Radix trigger
 * would have opened the dialog before we knew whether we needed it.
 */
export function ShareButton({
  url,
  size = "md",
  label = "Partager",
  title = "Partager la vidéo",
  shareTitle,
  description = "Toute personne disposant du lien peut la regarder, sans compte.",
}: {
  url: string;
  size?: "sm" | "md";
  label?: string;
  title?: string;
  /** What the OS share sheet announces. Defaults to the dialog title. */
  shareTitle?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function share() {
    // No `await` before this call, or the browser drops the user gesture.
    void nativeShare({ title: shareTitle ?? title, url }).then((outcome) => {
      if (outcome === "unsupported") setOpen(true);
    });
  }

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Copie impossible");
    }
  }

  return (
    <>
      <button
        onClick={share}
        className={cn(buttonClass({ variant: "secondary", size: size === "sm" ? "sm" : "md" }), "rounded-full")}
      >
        <Share2 size={size === "sm" ? 15 : 16} aria-hidden />
        <span className={size === "sm" ? "hidden sm:inline" : ""}>{label}</span>
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent title={title} description={description}>
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-bg-0/40 p-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-text-hi outline-none"
              aria-label="Lien de partage"
            />
            <button onClick={copy} className={buttonClass({ variant: "primary", size: "sm" })}>
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
          >
            <ExternalLink size={15} aria-hidden /> Ouvrir dans un nouvel onglet
          </a>
        </ModalContent>
      </Modal>
    </>
  );
}
