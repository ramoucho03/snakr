import {
  File,
  FileText,
  FileCode,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import type { PreviewKind } from "@/lib/mime";
import { cn } from "@/lib/utils";

const MAP: Record<PreviewKind, { icon: LucideIcon; tint: string }> = {
  image: { icon: ImageIcon, tint: "text-tan" },
  video: { icon: Video, tint: "text-bone" },
  audio: { icon: Music, tint: "text-smoke" },
  pdf: { icon: FileText, tint: "text-danger" },
  text: { icon: FileCode, tint: "text-tan" },
  markdown: { icon: FileText, tint: "text-bone" },
  docx: { icon: FileText, tint: "text-smoke" },
  sheet: { icon: FileSpreadsheet, tint: "text-success" },
  generic: { icon: File, tint: "text-text-lo" },
};

export function TypeIcon({
  kind,
  size = 22,
  className,
}: {
  kind: PreviewKind;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, tint } = MAP[kind] ?? MAP.generic;
  return <Icon size={size} className={cn(tint, className)} aria-hidden />;
}

export function typeTint(kind: PreviewKind): string {
  return (MAP[kind] ?? MAP.generic).tint;
}
