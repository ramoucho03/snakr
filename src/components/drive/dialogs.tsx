"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy, Check, FolderInput, Home, UserPlus, Trash2, Link as LinkIcon } from "lucide-react";
import { Modal, ModalContent, ModalClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { cn, initials } from "@/lib/utils";
import type { TargetItem } from "./types";
import {
  createFolderAction,
  renameAction,
  moveAction,
  bulkMoveAction,
  createShareAction,
  moveTargetsAction,
  grantAccessAction,
  listGrantsAction,
  revokeAccessAction,
  type MoveTarget,
} from "@/app/drive/actions";
import type { ResourceGrant } from "@/lib/permissions";

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

// ── Move (single item OR a bulk selection) ─────────────────────────────────
export function MoveDialog({
  item,
  items,
  open,
  onOpenChange,
  onMoved,
}: {
  item: TargetItem | null;
  /** When set (non-empty), the dialog moves the whole selection at once. */
  items?: TargetItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<MoveTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  const list = items && items.length > 0 ? items : item ? [item] : [];

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    moveTargetsAction()
      .then(setTargets)
      .finally(() => setLoading(false));
  }, [open]);

  // Exclude every selected folder and its whole subtree (can't move into own child).
  const movedFolderIds = list.filter((i) => i.type === "FOLDER").map((i) => i.id);
  const options = targets.filter((t) => {
    if (movedFolderIds.length === 0) return true;
    if (movedFolderIds.includes(t.id)) return false;
    const ancestors = t.path.split("/").filter(Boolean);
    return !movedFolderIds.some((id) => ancestors.includes(id));
  });

  function confirm() {
    if (list.length === 0) return;
    start(async () => {
      const r =
        list.length === 1
          ? await moveAction({ id: list[0].id, type: list[0].type, targetFolderId: selected })
          : await bulkMoveAction({
              items: list.map(({ id, type }) => ({ id, type })),
              targetFolderId: selected,
            });
      if (r.ok) {
        const moved = "moved" in r && typeof r.moved === "number" ? r.moved : 1;
        toast.success(moved > 1 ? `${moved} éléments déplacés` : "Déplacé");
        onOpenChange(false);
        onMoved?.();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Déplacer vers"
        description={
          list.length === 1
            ? `« ${list[0].name} »`
            : list.length > 1
              ? `${list.length} éléments sélectionnés`
              : undefined
        }
      >
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

function TabTrigger({
  value,
  icon,
  children,
}: {
  value: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-text-lo transition-colors outline-none",
        "data-[state=active]:bg-bg-1 data-[state=active]:text-text-hi",
      )}
    >
      {icon}
      {children}
    </Tabs.Trigger>
  );
}

/** Internal (member-to-member) access management for a file or folder. */
function AccessPanel({ item, open }: { item: TargetItem | null; open: boolean }) {
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"READ" | "WRITE">("READ");
  const [grants, setGrants] = useState<ResourceGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !item) return;
    setEmail("");
    setLevel("READ");
    setLoading(true);
    listGrantsAction({ resourceType: item.type, resourceId: item.id })
      .then((r) => {
        if (r.ok) setGrants(r.grants);
      })
      .finally(() => setLoading(false));
  }, [open, item]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    start(async () => {
      const r = await grantAccessAction({
        resourceType: item.type,
        resourceId: item.id,
        email,
        level,
      });
      if (r.ok) {
        setGrants(r.grants);
        setEmail("");
        toast.success("Accès accordé");
      } else {
        toast.error(r.error);
      }
    });
  }

  function revoke(permissionId: string) {
    start(async () => {
      const r = await revokeAccessAction({ permissionId });
      if (r.ok) {
        setGrants(r.grants);
        toast.success("Accès retiré");
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Field label="Inviter un membre par e-mail">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="membre@exemple.fr"
              autoComplete="off"
              className="flex-1"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as "READ" | "WRITE")}
              className="min-h-10 rounded-lg border border-glass-border bg-glass px-2.5 text-sm text-text-hi outline-none focus:border-accent/70 sm:min-h-0"
              aria-label="Niveau d'accès"
            >
              <option value="READ">Lecture</option>
              <option value="WRITE">Écriture</option>
            </select>
          </div>
        </Field>
        <Button type="submit" loading={pending} className="self-end">
          <UserPlus size={16} /> Partager
        </Button>
      </form>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-text-faint">Accès actuels</p>
        {loading ? (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        ) : grants.length === 0 ? (
          <p className="py-2 text-sm text-text-faint">Aucun membre pour l'instant.</p>
        ) : (
          grants.map((g) => (
            <div key={g.id} className="flex items-center gap-2.5 rounded-lg bg-glass px-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-1 text-xs font-semibold text-text-hi">
                {initials(g.user.displayName ?? g.user.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-hi">
                  {g.user.displayName ?? g.user.email}
                </p>
                <p className="text-xs text-text-faint">
                  {g.level === "WRITE" ? "Écriture" : "Lecture"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(g.id)}
                disabled={pending}
                aria-label="Retirer l'accès"
                className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
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
    if (await copyText(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error("Copie impossible");
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent title="Partager" description={item ? `« ${item.name} »` : undefined}>
        <Tabs.Root defaultValue="link" className="mt-1">
          <Tabs.List className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-glass p-1">
            <TabTrigger value="link" icon={<LinkIcon size={14} />}>
              Lien public
            </TabTrigger>
            <TabTrigger value="members" icon={<UserPlus size={14} />}>
              Membres
            </TabTrigger>
          </Tabs.List>
          <Tabs.Content value="link" className="outline-none">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </Tabs.Content>
          <Tabs.Content value="members" className="outline-none">
            <AccessPanel item={item} open={open} />
          </Tabs.Content>
        </Tabs.Root>
      </ModalContent>
    </Modal>
  );
}
