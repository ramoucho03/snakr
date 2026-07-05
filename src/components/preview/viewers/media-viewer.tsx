"use client";

import { useState } from "react";
import { Music } from "lucide-react";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Native HTML5 media player for video and audio.
 *
 * NOTE: `@vidstack/react@0.6.15` is installed, but its runtime bundle imports
 * from the `vidstack` core package, which is NOT present in node_modules — so
 * importing it would break the Turbopack build outright (not merely lack CSS).
 * The authenticated file route returns HTTP 206 for Range requests, so native
 * `<video>`/`<audio>` scrubbing works correctly. This is the deliberate,
 * build-safe fallback called for in the brief.
 */
export default function MediaViewer({
  file,
  kind,
}: {
  file: PreviewFile;
  kind: "video" | "audio";
}) {
  const [failed, setFailed] = useState(false);
  const src = `/api/files/${file.id}`;

  if (failed) return <DownloadCard file={file} reason="Lecture impossible" />;

  if (kind === "audio") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6">
        <div className="glass glass-sheen grid h-24 w-24 place-items-center rounded-full sm:h-28 sm:w-28">
          <Music size={48} className="text-accent" aria-hidden />
        </div>
        <p className="font-display max-w-[90%] truncate text-lg text-text-hi">
          {file.name}
        </p>
        <audio
          src={src}
          controls
          onError={() => setFailed(true)}
          className="w-[min(90%,34rem)]"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-2 sm:p-4">
      <video
        src={src}
        controls
        playsInline
        onError={() => setFailed(true)}
        className="max-h-full max-w-full rounded-xl bg-black shadow-2xl"
      />
    </div>
  );
}
