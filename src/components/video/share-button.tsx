"use client";

import { useState } from "react";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { Modal, ModalTrigger, ModalContent } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Share a public/unlisted video: a modal with the copyable public link. Only
 * rendered by callers once a video has actually left PRIVATE.
 */
export function ShareButton({ url, size = "md" }: { url: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible");
    }
  }

  return (
    <Modal>
      <ModalTrigger asChild>
        <button className={cn(buttonClass({ variant: "secondary", size: size === "sm" ? "sm" : "md" }), "rounded-full")}>
          <Share2 size={size === "sm" ? 15 : 16} aria-hidden />
          <span className={size === "sm" ? "hidden sm:inline" : ""}>Partager</span>
        </button>
      </ModalTrigger>
      <ModalContent title="Partager la vidéo" description="Toute personne disposant du lien peut la regarder, sans compte.">
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
  );
}
