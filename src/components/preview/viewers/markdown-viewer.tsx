"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Markdown viewer. Content is UNTRUSTED, so it is piped through
 * `rehype-sanitize` and raw HTML is never enabled (no `rehype-raw`). GitHub
 * flavoured markdown (tables, task lists, strikethrough) via `remark-gfm`.
 * Styling is a hand-rolled prose scale using Tailwind arbitrary variants so we
 * stay self-contained (no typography plugin).
 */
const CAP = 400 * 1024;

const PROSE = cn(
  "mx-auto max-w-3xl px-6 py-6 text-[15px] leading-7 text-text-lo",
  "[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-text-hi",
  "[&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-text-hi",
  "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-text-hi",
  "[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:font-display [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-text-hi",
  "[&_p]:my-3",
  "[&_a]:text-neon-cyan [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent",
  "[&_strong]:font-semibold [&_strong]:text-text-hi",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:text-text-faint",
  "[&_hr]:my-6 [&_hr]:border-glass-border",
  "[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-4 [&_pre]:text-[13px]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-glass [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em] [&_:not(pre)>code]:text-text-hi",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-glass-border [&_th]:bg-glass-strong [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-text-hi",
  "[&_td]:border [&_td]:border-glass-border [&_td]:px-3 [&_td]:py-1.5",
);

type State =
  | { status: "loading" }
  | { status: "ok"; text: string }
  | { status: "error" };

export default function MarkdownViewer({ file }: { file: PreviewFile }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/files/${file.id}`,
          file.size > CAP ? { headers: { Range: `bytes=0-${CAP - 1}` } } : undefined,
        );
        if (!res.ok && res.status !== 206) throw new Error(String(res.status));
        const text = await res.text();
        if (!cancelled) setState({ status: "ok", text });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, file.size]);

  if (state.status === "error") {
    return <DownloadCard file={file} reason="Aperçu Markdown indisponible" />;
  }
  if (state.status === "loading") {
    return (
      <div className="grid h-full place-items-center gap-2 text-text-lo">
        <Spinner />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className={PROSE}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {state.text}
        </Markdown>
      </div>
    </div>
  );
}
