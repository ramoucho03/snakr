"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { useUppyState } from "@uppy/react";
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatBytes } from "@/lib/utils";

const CHUNK = 8 * 1024 * 1024; // 8 MB — keeps every PATCH under proxy body limits.
const MAX_FILES = 100;

type DriveFile = ReturnType<Uppy["getFiles"]>[number];

/**
 * ONE Uppy instance for the whole browser session (module scope, never
 * destroyed): uploads keep streaming when the dialog closes and when the user
 * navigates between drive folders. The tus plugin sends 8 MB chunks to
 * /api/upload; the destination folder rides in per-file metadata (stamped at
 * add time, so a queued file keeps the folder it was added in), which the
 * server re-checks for ownership.
 */
let singleton: Uppy | null = null;
function getUppy(): Uppy {
  if (!singleton) {
    singleton = new Uppy({
      autoProceed: false,
      restrictions: { maxNumberOfFiles: MAX_FILES },
    }).use(Tus, {
      endpoint: "/api/upload",
      chunkSize: CHUNK,
      limit: 3,
      removeFingerprintOnSuccess: true,
    });
  }
  return singleton;
}

type RowStatus = "queued" | "uploading" | "paused" | "done" | "error";

function statusOf(f: DriveFile): RowStatus {
  if (f.error) return "error";
  if (f.progress.uploadComplete) return "done";
  if (f.progress.uploadStarted) return f.isPaused ? "paused" : "uploading";
  return "queued";
}

const uploadedBytes = (f: DriveFile) =>
  typeof f.progress.bytesUploaded === "number" ? f.progress.bytesUploaded : 0;

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `≈ ${Math.max(1, Math.round(seconds))} s`;
  return `≈ ${Math.round(seconds / 60)} min`;
}

const ICON_BTN =
  "grid h-8 w-8 place-items-center rounded-full text-text-faint transition-colors hover:bg-glass-strong hover:text-text-hi";

function FileRow({ uppy, file }: { uppy: Uppy; file: DriveFile }) {
  const status = statusOf(file);
  const pct = status === "done" ? 100 : Math.round(file.progress.percentage ?? 0);
  const size = file.size ?? 0;

  const line =
    status === "error"
      ? `Échec${file.error ? ` — ${file.error}` : ""}`
      : status === "done"
        ? `Terminé · ${formatBytes(size)}`
        : status === "paused"
          ? `En pause · ${pct} % de ${formatBytes(size)}`
          : status === "uploading"
            ? `${formatBytes(uploadedBytes(file))} / ${formatBytes(size)} · ${pct} %`
            : formatBytes(size);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-glass-border bg-glass px-3 py-2.5">
      {/* Extension chip — instant type recognition without sniffing MIME. */}
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-glass-border bg-bg-1/60 text-[0.6rem] font-bold uppercase tracking-wider text-tan">
        {file.extension ? file.extension.slice(0, 4) : "—"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-hi">
            {file.name}
          </p>
          {status === "done" && (
            <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden />
          )}
          {status === "error" && (
            <AlertCircle size={15} className="shrink-0 text-danger" aria-hidden />
          )}
        </div>
        <p
          className={cn(
            "tabular mt-0.5 truncate text-xs",
            status === "error" ? "text-danger" : "text-text-faint",
          )}
          title={status === "error" ? (file.error ?? undefined) : undefined}
        >
          {line}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-glass-strong">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              status === "error"
                ? "bg-danger"
                : status === "done"
                  ? "bg-bone/70"
                  : "bg-linear-to-r from-tan to-bone",
            )}
            style={{ width: `${status === "error" ? 100 : pct}%` }}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {(status === "uploading" || status === "paused") && (
          <button
            type="button"
            onClick={() => uppy.pauseResume(file.id)}
            className={ICON_BTN}
            aria-label={status === "paused" ? "Reprendre" : "Mettre en pause"}
          >
            {status === "paused" ? <Play size={15} /> : <Pause size={15} />}
          </button>
        )}
        {status === "error" && (
          <button
            type="button"
            onClick={() => void uppy.retryUpload(file.id)}
            className={ICON_BTN}
            aria-label="Réessayer"
          >
            <RotateCcw size={15} />
          </button>
        )}
        {status !== "uploading" && status !== "paused" && (
          <button
            type="button"
            onClick={() => uppy.removeFile(file.id)}
            className={ICON_BTN}
            aria-label="Retirer"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

export function UploadDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [uppy] = useState(getUppy);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [rate, setRate] = useState<{ speed: number; eta: number } | null>(null);
  const lastTick = useRef<{ t: number; b: number } | null>(null);

  const files = useUppyState(uppy, (s) => s.files);
  const totalProgress = useUppyState(uppy, (s) => s.totalProgress);
  const list = useMemo(() => Object.values(files), [files]);

  const counts = useMemo(() => {
    let done = 0;
    let failed = 0;
    let started = 0;
    let paused = 0;
    let queued = 0;
    let size = 0;
    for (const f of list) {
      size += f.size ?? 0;
      const st = statusOf(f);
      if (st === "done") done++;
      else if (st === "error") failed++;
      else if (st === "queued") queued++;
      else {
        started++;
        if (st === "paused") paused++;
      }
    }
    return { done, failed, started, paused, queued, size, total: list.length };
  }, [list]);

  const uploading = counts.started > 0;
  const allPaused = uploading && counts.paused === counts.started;

  // Batch outcome toast + drive refresh — registered per mount, never lost.
  useEffect(() => {
    const handleComplete = (result: { successful?: unknown[]; failed?: unknown[] }) => {
      const ok = result.successful?.length ?? 0;
      const bad = result.failed?.length ?? 0;
      if (ok > 0) {
        toast.success(`${ok} fichier${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""}`);
        routerRef.current.refresh();
      }
      if (bad > 0) toast.error(`${bad} import${bad > 1 ? "s" : ""} en échec`);
    };
    const handleRestriction = (_file: unknown, error: { message: string }) => {
      toast.error(error.message);
    };
    uppy.on("complete", handleComplete);
    uppy.on("restriction-failed", handleRestriction);
    return () => {
      uppy.off("complete", handleComplete);
      uppy.off("restriction-failed", handleRestriction);
    };
  }, [uppy]);

  // Stamp the CURRENT folder on each file as it's added: a queued file keeps
  // the destination it was added in, even if the user navigates elsewhere.
  useEffect(() => {
    const stamp = (file: { id: string }) =>
      uppy.setFileMeta(file.id, { folderId: folderId ?? "" });
    uppy.on("file-added", stamp);
    return () => {
      uppy.off("file-added", stamp);
    };
  }, [uppy, folderId]);

  // Fresh sheet on reopen: sweep rows already finished, keep live/failed ones.
  useEffect(() => {
    if (!open) return;
    for (const f of uppy.getFiles()) {
      if (f.progress.uploadComplete) uppy.removeFile(f.id);
    }
  }, [open, uppy]);

  // Aggregate speed (EMA) + ETA, sampled once per second while transferring.
  const transferring = uploading && !allPaused;
  useEffect(() => {
    if (!transferring) {
      lastTick.current = null;
      setRate(null);
      return;
    }
    const id = setInterval(() => {
      let up = 0;
      let remaining = 0;
      for (const f of uppy.getFiles()) {
        if (f.error || f.progress.uploadComplete) continue;
        if (!f.progress.uploadStarted) {
          remaining += f.size ?? 0;
          continue;
        }
        const b = uploadedBytes(f);
        up += b;
        remaining += Math.max((f.progress.bytesTotal ?? f.size ?? 0) - b, 0);
      }
      const now = Date.now();
      const prev = lastTick.current;
      lastTick.current = { t: now, b: up };
      if (!prev || now <= prev.t) return;
      const inst = ((up - prev.b) / (now - prev.t)) * 1000;
      if (inst < 0) return; // a file just completed; sample is meaningless
      setRate((old) => {
        const speed = old ? old.speed * 0.7 + inst * 0.3 : inst;
        return { speed, eta: speed > 0 ? remaining / speed : Infinity };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [transferring, uppy]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      if (arr.length === 0) return;
      try {
        uppy.addFiles(arr.map((data) => ({ name: data.name, type: data.type, data })));
      } catch {
        // Restriction errors already surface via the restriction-failed toast.
      }
    },
    [uppy],
  );

  const pick = () => inputRef.current?.click();

  const dragProps = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Importer des fichiers" className="w-[min(94vw,44rem)]">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {counts.total === 0 ? (
          /* ── Empty state: one big, clickable drop surface ─────────────── */
          <button
            type="button"
            onClick={pick}
            {...dragProps}
            className={cn(
              "group grid w-full place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-200",
              dragging
                ? "scale-[1.01] border-accent bg-glass-strong"
                : "border-glass-border bg-glass/40 hover:border-tan/60 hover:bg-glass",
            )}
          >
            <span className="flex flex-col items-center gap-4">
              <span
                className={cn(
                  "grid h-16 w-16 place-items-center rounded-2xl border border-glass-border bg-glass transition-transform duration-200",
                  dragging ? "scale-110" : "group-hover:scale-105",
                )}
              >
                <CloudUpload size={28} className="text-tan" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-lg font-semibold text-text-hi">
                  {dragging ? "Déposez pour ajouter" : "Glissez vos fichiers ici"}
                </span>
                <span className="mt-1 block text-sm text-text-lo">
                  ou cliquez pour les choisir depuis votre appareil
                </span>
              </span>
              <span className="tabular text-xs text-text-faint">
                Jusqu&apos;à {MAX_FILES} fichiers · multi-Go · reprise automatique en
                cas de coupure
              </span>
            </span>
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            {/* ── Compact add strip ─────────────────────────────────────── */}
            <button
              type="button"
              onClick={pick}
              {...dragProps}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-medium transition-colors",
                dragging
                  ? "border-accent bg-glass-strong text-text-hi"
                  : "border-glass-border text-text-lo hover:border-tan/60 hover:bg-glass hover:text-text-hi",
              )}
            >
              <Plus size={16} className="text-tan" aria-hidden />
              Ajouter des fichiers
              <span className="hidden font-normal text-text-faint sm:inline">
                — ou déposez-les ici
              </span>
            </button>

            {/* ── File list ─────────────────────────────────────────────── */}
            <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
              {list.map((f) => (
                <FileRow key={f.id} uppy={uppy} file={f} />
              ))}
            </ul>

            {/* ── Global progress ───────────────────────────────────────── */}
            {uploading && (
              <div className="rounded-xl border border-glass-border bg-glass px-4 py-3">
                <div className="tabular flex items-center justify-between text-xs text-text-lo">
                  <span>
                    {allPaused
                      ? "En pause"
                      : rate
                        ? `${formatBytes(Math.round(rate.speed))}/s${
                            Number.isFinite(rate.eta)
                              ? ` · ${formatEta(rate.eta)} restant`
                              : ""
                          }`
                        : "Import en cours…"}
                  </span>
                  <span className="font-semibold text-text-hi">
                    {totalProgress ?? 0} %
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-glass-strong">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      allPaused ? "bg-smoke" : "bg-linear-to-r from-tan to-bone",
                    )}
                    style={{ width: `${totalProgress ?? 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[0.7rem] text-text-faint">
                  Vous pouvez fermer cette fenêtre — les envois continuent en
                  arrière-plan.
                </p>
              </div>
            )}

            {/* ── Footer: batch summary + phase actions ─────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-glass-border pt-4">
              <p className="tabular text-xs text-text-faint">
                {counts.total} fichier{counts.total > 1 ? "s" : ""} ·{" "}
                {formatBytes(counts.size)}
                {counts.done > 0 && ` · ${counts.done} terminé${counts.done > 1 ? "s" : ""}`}
                {counts.failed > 0 && ` · ${counts.failed} en échec`}
              </p>
              <div className="flex items-center gap-2">
                {uploading ? (
                  <>
                    <Button
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      onClick={() => uppy.cancelAll()}
                    >
                      Tout annuler
                    </Button>
                    {allPaused ? (
                      <Button onClick={() => uppy.resumeAll()}>
                        <Play size={15} /> Reprendre
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => uppy.pauseAll()}>
                        <Pause size={15} /> Tout mettre en pause
                      </Button>
                    )}
                  </>
                ) : counts.queued > 0 ? (
                  <>
                    <Button variant="ghost" onClick={() => uppy.clear()}>
                      Tout retirer
                    </Button>
                    <Button onClick={() => void uppy.upload()}>
                      <CloudUpload size={15} /> Importer {counts.queued} fichier
                      {counts.queued > 1 ? "s" : ""}
                    </Button>
                  </>
                ) : counts.failed > 0 ? (
                  <>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                      Fermer
                    </Button>
                    <Button onClick={() => void uppy.retryAll()}>
                      <RotateCcw size={15} /> Réessayer{" "}
                      {counts.failed > 1 ? `les ${counts.failed} échecs` : "l'échec"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => uppy.clear()}>
                      Tout effacer
                    </Button>
                    <Button onClick={() => onOpenChange(false)}>
                      <CheckCircle2 size={15} /> Fermer
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
