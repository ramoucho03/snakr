"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, FolderInput, Home } from "lucide-react";
import { Modal, ModalContent, ModalClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { TargetItem } from "./types";
import {
  createFolderAction,
  renameAction,
  moveAction,
  createShareAction,
  moveTargetsAction,
  type MoveTarget,
} from "@/app/drive/actions";

function Footer({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <ModalClose asChild>
        <Button type="button" variant="ghost">
          Annuler
        </Button>
      </ModalClose>
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </div>
  );
}

// ── New folder ─────────────────────────────────────────────────────────────
export function NewFolderDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createFolderAction({ name, parentId: folderId });
      if (r.ok) {
        toast.success("Dossier créé");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.fieldErrors?.name ?? r.error);
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Nouveau dossier">
        <form onSubmit={submit} noValidate>
          <Field label="Nom du dossier" error={error} htmlFor="new-folder-name">
            <Input
              id="new-folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sans titre"
              maxLength={200}
            />
          </Field>
          <Footer pending={pending} submitLabel="Créer" />
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Rename ─────────────────────────────────────────────────────────────────
export function RenameDialog({
  item,
  open,
  onOpenChange,
}: {
  item: TargetItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open && item) {
      setName(item.name);
      setError(null);
    }
  }, [open, item]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    start(async () => {
      const r = await renameAction({ id: item.id, type: item.type, name });
      if (r.ok) {
        toast.success("Renommé");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.fieldErrors?.name ?? r.error);
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Renommer">
        <form onSubmit={submit} noValidate>
          <Field label="Nouveau nom" error={error} htmlFor="rename-name">
            <Input
              id="rename-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </Field>
          <Footer pending={pending} submitLabel="Renommer" />
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Move ───────────────────────────────────────────────────────────────────
export function MoveDialog({
  item,
  open,
  onOpenChange,
}: {
  item: TargetItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<MoveTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    moveTargetsAction()
      .then(setTargets)
      .finally(() => setLoading(false));
  }, [open]);

  // Exclude the folder itself and its whole subtree (can't move into own child).
  const options = targets.filter((t) => {
    if (!item || item.type !== "FOLDER") return true;
    if (t.id === item.id) return false;
    return !t.path.split("/").filter(Boolean).includes(item.id);
  });

  function confirm() {
    if (!item) return;
    start(async () => {
      const r = await moveAction({ id: item.id, type: item.type, targetFolderId: selected });
      if (r.ok) {
        toast.success("Déplacé");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Déplacer vers" description={item ? `« ${item.name} »` : undefined}>
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-glass-border p-1.5">
          <DestRow
            label="Mon drive (racine)"
            icon={<Home size={15} />}
            depth={0}
            active={selected === null}
            onClick={() => setSelected(null)}
          />
          {loading && <p className="px-3 py-2 text-sm text-text-faint">Chargement…</p>}
          {options.map((t) => (
            <DestRow
              key={t.id}
              label={t.name}
              icon={<FolderInput size={15} />}
              depth={t.path.split("/").filter(Boolean).length}
              active={selected === t.id}
              onClick={() => setSelected(t.id)}
            />
          ))}
          {!loading && options.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-faint">Aucun autre dossier.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <ModalClose asChild>
            <Button type="button" variant="ghost">
              Annuler
            </Button>
          </ModalClose>
          <Button onClick={confirm} loading={pending}>
            Déplacer ici
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

function DestRow({
  label,
  icon,
  depth,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  depth: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors",
        active ? "bg-accent/20 text-text-hi" : "text-text-lo hover:bg-glass hover:text-text-hi",
      )}
    >
      <span className="text-accent">{icon}</span>
      <span className="truncate">{label}</span>
      {active && <Check size={15} className="ml-auto text-accent" />}
    </button>
  );
}

// ── Share ──────────────────────────────────────────────────────────────────
export function ShareDialog({
  item,
  open,
  onOpenChange,
}: {
  item: TargetItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<string>("7");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setPassword("");
      setExpiry("7");
      setMaxDownloads("");
      setNote("");
      setLink(null);
      setCopied(false);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    start(async () => {
      const r = await createShareAction({
        fileId: item.type === "FILE" ? item.id : null,
        folderId: item.type === "FOLDER" ? item.id : null,
        password: password.trim() || null,
        expiresInDays: expiry === "never" ? null : Number(expiry),
        maxDownloads: maxDownloads ? Number(maxDownloads) : null,
        note: note.trim() || null,
      });
      if (r.ok) {
        setLink(r.url);
        toast.success("Lien de partage créé");
      } else {
        toast.error(r.error);
      }
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copie impossible");
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Partager par lien"
        description={item ? `« ${item.name} »` : undefined}
      >
        {link ? (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-sm text-text-lo">
              Copiez ce lien maintenant — il ne sera plus jamais affiché.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" size="icon" onClick={copy} aria-label="Copier">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Terminé
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-1 flex flex-col gap-4">
            <Field label="Mot de passe (optionnel)" hint="Laisser vide pour un accès libre">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiration">
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full rounded-lg border border-glass-border bg-glass px-3 py-2.5 text-sm text-text-hi outline-none focus:border-accent/70"
                >
                  <option value="1">1 jour</option>
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="365">1 an</option>
                  <option value="never">Jamais</option>
                </select>
              </Field>
              <Field label="Téléchargements max." hint="Vide = illimité">
                <Input
                  type="number"
                  min={1}
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  placeholder="∞"
                />
              </Field>
            </div>
            <Field label="Note (optionnel)">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Un mot pour le destinataire…"
                maxLength={500}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <ModalClose asChild>
                <Button type="button" variant="ghost">
                  Annuler
                </Button>
              </ModalClose>
              <Button type="submit" loading={pending}>
                Créer le lien
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
