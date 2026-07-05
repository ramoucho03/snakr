"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Centered, click-to-zoom image. Fit-to-modal by default (object-contain,
 * max-h/max-w); one click swaps to natural size and lets the surrounding box
 * scroll. Bytes come from the inline file route. A decode/network failure falls
 * back to the DownloadCard rather than showing a broken-image glyph.
 */
export default function ImageViewer({ file }: { file: PreviewFile }) {
  const [zoom, setZoom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const src = `/api/files/${file.id}`;

  if (failed) return <DownloadCard file={file} reason="Image illisible" />;

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-auto p-2 sm:p-4",
        zoom ? "cursor-zoom-out" : "cursor-zoom-in",
      )}
    >
      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={file.name}
        draggable={false}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onClick={() => setZoom((z) => !z)}
        className={cn(
          "select-none rounded-lg transition-opacity duration-200",
          loading ? "opacity-0" : "opacity-100",
          zoom ? "max-w-none" : "max-h-full max-w-full object-contain",
        )}
      />
    </div>
  );
}
