"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import Dashboard from "@uppy/react/dashboard";
import "@uppy/react/css/style.css";
import { Modal, ModalContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const CHUNK = 8 * 1024 * 1024; // 8 MB — keeps every PATCH under proxy body limits.

/**
 * Resumable uploader. Uppy drives the pause/resume/retry UI; the tus plugin
 * streams 8 MB chunks to our `/api/upload` handler. The destination folder rides
 * in per-upload metadata (`folderId`), which the server re-checks for ownership.
 * Loaded via `next/dynamic({ ssr:false })` so Uppy never touches the server.
 */
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

  const [uppy] = useState(() =>
    new Uppy({ autoProceed: false, restrictions: { maxNumberOfFiles: 100 } }).use(Tus, {
      endpoint: "/api/upload",
      chunkSize: CHUNK,
      limit: 3,
      removeFingerprintOnSuccess: true,
    }),
  );

  useEffect(() => {
    uppy.setMeta({ folderId: folderId ?? "" });
  }, [uppy, folderId]);

  // Register once; `result` is contextually typed by Uppy's event map.
  // `uppy.destroy()` on unmount also tears down the listener.
  useEffect(() => {
    uppy.on("complete", (result) => {
      const ok = result.successful?.length ?? 0;
      const bad = result.failed?.length ?? 0;
      if (ok > 0) {
        toast.success(`${ok} fichier${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""}`);
        routerRef.current.refresh();
      }
      if (bad > 0) toast.error(`${bad} import${bad > 1 ? "s" : ""} en échec`);
    });
    return () => {
      uppy.destroy();
    };
  }, [uppy]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Importer des fichiers" className="w-[min(94vw,44rem)]">
        <Dashboard
          uppy={uppy}
          proudlyDisplayPoweredByUppy={false}
          height={370}
          theme="dark"
          note="Glissez vos fichiers ici — la reprise est automatique en cas de coupure."
        />
      </ModalContent>
    </Modal>
  );
}
