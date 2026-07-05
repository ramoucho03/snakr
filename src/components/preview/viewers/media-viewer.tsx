"use client";

import { useState } from "react";
import { Music } from "lucide-react";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";
import { VideoPlayer } from "@/components/video/video-player";

/**
 * Media preview. Video is served through the shared <VideoPlayer> — native
 * controls for flat clips, a WebGL 360° viewer (drag-to-look) for equirectangular
 * sources. Audio uses a native <audio> element. The authenticated file route
 * answers Range with 206, so scrubbing and 360 texture upload both work.
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

  if (failed && kind === "audio") return <DownloadCard file={file} reason="Lecture impossible" />;

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
      <div className="aspect-video max-h-full w-full max-w-[min(100%,calc((100dvh-9rem)*16/9))]">
        <VideoPlayer
          src={src}
          poster={`/api/files/${file.id}/thumb`}
          filename={file.name}
          autoPlay
          fill
          className="shadow-2xl"
        />
      </div>
    </div>
  );
}
