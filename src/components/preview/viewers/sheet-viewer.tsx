"use client";

import { useEffect, useState } from "react";
import { extOf } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { PreviewFile } from "../preview-modal";
import { DownloadCard } from "../download-card";

/**
 * Spreadsheet viewer. SheetJS/xlsx is NOT installed, so only delimited text
 * (.csv / .tsv) is rendered as an HTML table; real binary .xlsx workbooks fall
 * through to the DownloadCard. The parser handles RFC-4180-style quoting
 * (doubled quotes, embedded delimiters/newlines) and caps output at MAX_ROWS.
 */
const MAX_ROWS = 500;

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length >= MAX_ROWS) return rows;
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type State =
  | { status: "loading" }
  | { status: "ok"; rows: string[][]; truncated: boolean }
  | { status: "error" };

export default function SheetViewer({ file }: { file: PreviewFile }) {
  const ext = extOf(file.name);
  const isDelimited = ext === "csv" || ext === "tsv";
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!isDelimited) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}`);
        if (!res.ok && res.status !== 206) throw new Error(String(res.status));
        const text = await res.text();
        const rows = parseDelimited(text, ext === "tsv" ? "\t" : ",");
        if (!cancelled) {
          setState({ status: "ok", rows, truncated: rows.length >= MAX_ROWS });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, ext, isDelimited]);

  if (!isDelimited) {
    return <DownloadCard file={file} reason="Aperçu tableur indisponible (.xlsx)" />;
  }
  if (state.status === "error") {
    return <DownloadCard file={file} reason="Aperçu tableur indisponible" />;
  }
  if (state.status === "loading") {
    return (
      <div className="grid h-full place-items-center gap-2 text-text-lo">
        <Spinner />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  const [header, ...body] = state.rows;
  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        {header && (
          <thead className="sticky top-0">
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="border border-glass-border bg-glass-strong px-3 py-2 text-left font-display font-semibold text-text-hi"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="hover:bg-glass">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className="whitespace-pre-wrap border border-glass-border px-3 py-1.5 text-text-lo"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {state.truncated && (
        <p className="pt-3 text-xs text-text-faint">
          Affichage limité aux {MAX_ROWS} premières lignes.
        </p>
      )}
    </div>
  );
}
