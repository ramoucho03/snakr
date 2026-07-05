"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * PDF viewer built on react-pdf. The worker is served from /public and MUST
 * match react-pdf's bundled pdfjs-dist version (5.4.296 here — react-pdf ships
 * its own nested copy that differs from the top-level pdfjs-dist@6). The worker
 * was copied from react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs.
 * Pages render in a scrollable column, width-fitted to the container; any load
 * error drops to the DownloadCard.
 */
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function PdfViewer({ file }: { file: PreviewFile }) {
  const src = `/api/files/${file.id}`;
  // Memoised so react-pdf doesn't re-fetch the document on every re-render.
  const fileProp = useMemo(() => ({ url: src }), [src]);

  const [numPages, setNumPages] = useState(0);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Leave room for padding; clamp to a comfortable reading width.
      setWidth(Math.min(Math.max(w - 32, 240), 900));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (failed) return <DownloadCard file={file} reason="Aperçu PDF indisponible" />;

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto px-2 py-3 sm:px-4 sm:py-4">
      <Document
        file={fileProp}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        onLoadError={() => setFailed(true)}
        onSourceError={() => setFailed(true)}
        loading={
          <div className="grid h-40 place-items-center gap-2 text-text-lo">
            <Spinner />
            <span className="text-sm">Chargement…</span>
          </div>
        }
        error={
          <div className="grid h-40 place-items-center text-sm text-text-faint">
            Aperçu indisponible
          </div>
        }
        className="mx-auto flex flex-col items-center gap-5"
      >
        {numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="overflow-hidden rounded-lg bg-white shadow-xl">
                <Page
                  pageNumber={i + 1}
                  width={width || undefined}
                  renderAnnotationLayer
                  renderTextLayer
                  loading={
                    <div className="grid h-40 w-full place-items-center">
                      <Spinner size={16} />
                    </div>
                  }
                />
              </div>
              <span className="text-xs text-text-faint tabular">
                Page {i + 1} sur {numPages}
              </span>
            </div>
          ))}
      </Document>
    </div>
  );
}
