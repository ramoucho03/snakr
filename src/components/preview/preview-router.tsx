"use client";

import dynamic from "next/dynamic";
import type { PreviewFile } from "./preview-modal";
import { DownloadCard } from "./download-card";
import { ViewerErrorBoundary } from "./viewer-error-boundary";
import { ViewerSkeleton } from "./viewer-skeleton";

/**
 * Dispatches a PreviewFile to the right viewer. EVERY heavy viewer is code-split
 * with `next/dynamic({ ssr: false })` so opening, say, an image never ships
 * pdf.js, docx-preview or react-markdown. Each viewer is wrapped in an error
 * boundary that falls back to the DownloadCard, guaranteeing the modal body is
 * never left blank.
 */
const ImageViewer = dynamic(() => import("./viewers/image-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton label="Chargement de l’image…" />,
});
const MediaViewer = dynamic(() => import("./viewers/media-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton label="Chargement du lecteur…" />,
});
const PdfViewer = dynamic(() => import("./viewers/pdf-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton label="Chargement du PDF…" />,
});
const TextViewer = dynamic(() => import("./viewers/text-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});
const MarkdownViewer = dynamic(() => import("./viewers/markdown-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});
const DocxViewer = dynamic(() => import("./viewers/docx-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton label="Chargement du document…" />,
});
const SheetViewer = dynamic(() => import("./viewers/sheet-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton label="Chargement du tableur…" />,
});

export function PreviewRouter({ file }: { file: PreviewFile }) {
  let content: React.ReactNode;
  switch (file.kind) {
    case "image":
      content = <ImageViewer file={file} />;
      break;
    case "video":
      content = <MediaViewer file={file} kind="video" />;
      break;
    case "audio":
      content = <MediaViewer file={file} kind="audio" />;
      break;
    case "pdf":
      content = <PdfViewer file={file} />;
      break;
    case "text":
      content = <TextViewer file={file} />;
      break;
    case "markdown":
      content = <MarkdownViewer file={file} />;
      break;
    case "docx":
      content = <DocxViewer file={file} />;
      break;
    case "sheet":
      content = <SheetViewer file={file} />;
      break;
    case "generic":
    default:
      content = <DownloadCard file={file} />;
      break;
  }

  return <ViewerErrorBoundary file={file}>{content}</ViewerErrorBoundary>;
}
