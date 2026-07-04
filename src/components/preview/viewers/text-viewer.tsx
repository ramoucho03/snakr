"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Plain-text / source code viewer. Fetches the file (capped at ~400 KB via a
 * Range request so huge logs don't blow up the tab), then renders it in a
 * monospace grid with a sticky line-number gutter and horizontal scroll. No
 * dangerouslySetInnerHTML — every line is rendered as an escaped text node.
 */
const CAP = 400 * 1024;

type State =
  | { status: "loading" }
  | { status: "ok"; text: string; truncated: boolean }
  | { status: "error" };

export default function TextViewer({ file }: { file: PreviewFile }) {
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
        if (!cancelled) {
          setState({ status: "ok", text, truncated: file.size > CAP });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, file.size]);

  if (state.status === "error") {
    return <DownloadCard file={file} reason="Aperçu texte indisponible" />;
  }
  if (state.status === "loading") {
    return (
      <div className="grid h-full place-items-center gap-2 text-text-lo">
        <Spinner />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  const lines = state.text.split("\n");
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse font-mono text-[13px] leading-5">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td className="sticky left-0 select-none border-r border-glass-border bg-glass-strong px-3 text-right text-text-faint tabular">
                {i + 1}
              </td>
              <td className="whitespace-pre px-4 text-text-hi">
                {line || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.truncated && (
        <p className="px-4 py-3 text-xs text-text-faint">
          Fichier tronqué à 400 Ko pour l’aperçu.
        </p>
      )}
    </div>
  );
}
