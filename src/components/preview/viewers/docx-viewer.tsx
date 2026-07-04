"use client";

import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Word (.docx) viewer via docx-preview, which renders the document as HTML into
 * a container element. We fetch the raw bytes and hand docx-preview a Blob; it
 * paints onto a white document surface sitting inside the glass modal. Any
 * failure (corrupt file, unsupported feature) drops to the DownloadCard.
 */
type Status = "loading" | "ok" | "error";

export default function DocxViewer({ file }: { file: PreviewFile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}`);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        if (cancelled || !el) return;
        el.innerHTML = "";
        await renderAsync(new Blob([buf]), el);
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  if (status === "error") {
    return <DownloadCard file={file} reason="Aperçu Word indisponible" />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      {status === "loading" && (
        <div className="grid h-40 place-items-center gap-2 text-text-lo">
          <Spinner />
          <span className="text-sm">Chargement…</span>
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "mx-auto max-w-4xl rounded-xl bg-white text-black shadow-2xl",
          status === "loading" && "hidden",
        )}
      />
    </div>
  );
}
