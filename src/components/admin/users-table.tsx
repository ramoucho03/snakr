"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  Gauge,
  UserCheck,
  UserX,
} from "lucide-react";
import { updateUser } from "@/app/admin/actions";
import type { AdminUpdateUserInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalClose } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";
import { cn, formatBytes, formatRelative, initials } from "@/lib/utils";

const GB = 1024 ** 3;

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
  isSuspended: boolean;
  storageUsed: number;
  storageLimit: number | null;
  createdAt: string;
  fileCount: number;
}

export function UsersTable({
  users,
  currentAdminId,
}: {
  users: AdminUserRow[];
  currentAdminId: string;
}) {
  return (
    <div className="glass overflow-hidden rounded-[var(--radius-lg)] p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-glass-border text-left text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-medium">Utilisateur</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Fichiers</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Stockage</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Inscrit</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} u={u} currentAdminId={currentAdminId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ u, currentAdminId }: { u: AdminUserRow; currentAdminId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaGb, setQuotaGb] = useState(
    u.storageLimit == null ? "" : String(Number((u.storageLimit / GB).toFixed(3))),
  );

  const isSelf = u.id === currentAdminId;

  function run(input: AdminUpdateUserInput, successMsg: string, after?: () => void) {
    startTransition(async () => {
      const res = await updateUser(input);
      if (res.ok) {
        toast.success(successMsg);
        after?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function toggleRole() {
    const nextRole = u.role === "ADMIN" ? "USER" : "ADMIN";
    run(
      { userId: u.id, role: nextRole },
      nextRole === "ADMIN" ? "Utilisateur promu administrateur." : "Administrateur rétrogradé.",
    );
  }

  function toggleSuspend() {
    run(
      { userId: u.id, isSuspended: !u.isSuspended },
      u.isSuspended ? "Compte réactivé." : "Compte suspendu.",
    );
  }

  function saveQuota() {
    const trimmed = quotaGb.trim();
    const n = Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(n) || n < 0)) {
      toast.error("Quota invalide : entrez un nombre positif de Go, ou laissez vide.");
      return;
    }
    const storageLimitBytes = trimmed === "" ? null : Math.round(n * GB);
    run({ userId: u.id, storageLimitBytes }, "Quota mis à jour.", () => setQuotaOpen(false));
  }

  return (
    <tr className="border-b border-glass-border/60 last:border-0 hover:bg-glass/40">
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-glass text-xs font-semibold text-text-lo">
            {initials(u.displayName ?? u.email)}
          </span>
          <div className="min-w-0 max-w-50 sm:max-w-none">
            <p className="truncate font-medium text-text-hi">{u.displayName ?? "—"}</p>
            <p className="truncate text-xs text-text-faint">{u.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <Badge
          tone={u.role === "ADMIN" ? "accent" : "muted"}
          label={u.role === "ADMIN" ? "Admin" : "Utilisateur"}
        />
      </td>

      {/* Files */}
      <td className="hidden px-4 py-3 tabular-nums text-text-lo lg:table-cell">{u.fileCount}</td>

      {/* Storage */}
      <td className="hidden px-4 py-3 whitespace-nowrap text-text-lo sm:table-cell">
        <span className="text-text-hi">{formatBytes(u.storageUsed)}</span>
        <span className="text-text-faint">
          {" / "}
          {u.storageLimit == null ? "illimité" : formatBytes(u.storageLimit)}
        </span>
      </td>

      {/* Registered */}
      <td className="hidden px-4 py-3 whitespace-nowrap text-text-lo md:table-cell">{formatRelative(u.createdAt)}</td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge
          tone={u.isSuspended ? "danger" : "success"}
          label={u.isSuspended ? "Suspendu" : "Actif"}
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownTrigger asChild>
            <button
              type="button"
              disabled={pending}
              aria-label="Actions"
              className="grid h-9 w-9 place-items-center rounded-lg text-text-faint transition-colors hover:bg-glass hover:text-text-hi disabled:opacity-40"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem
              onSelect={toggleRole}
              disabled={isSelf && u.role === "ADMIN"}
            >
              {u.role === "ADMIN" ? (
                <>
                  <ShieldMinus size={15} /> Rétrograder en utilisateur
                </>
              ) : (
                <>
                  <ShieldCheck size={15} /> Promouvoir administrateur
                </>
              )}
            </DropdownItem>
            <DropdownItem onSelect={() => setQuotaOpen(true)}>
              <Gauge size={15} /> Définir un quota
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger onSelect={toggleSuspend} disabled={isSelf}>
              {u.isSuspended ? (
                <>
                  <UserCheck size={15} /> Réactiver le compte
                </>
              ) : (
                <>
                  <UserX size={15} /> Suspendre le compte
                </>
              )}
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>

        <Modal open={quotaOpen} onOpenChange={setQuotaOpen}>
          <ModalContent title="Définir un quota" description={u.email}>
            <div className="flex flex-col gap-4 text-left">
              <Field
                label="Quota (Go)"
                hint="Laisser vide pour un stockage illimité."
              >
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="Illimité"
                  value={quotaGb}
                  onChange={(e) => setQuotaGb(e.target.value)}
                  autoFocus
                />
              </Field>
              <div className="flex justify-end gap-2">
                <ModalClose asChild>
                  <Button type="button" variant="ghost">
                    Annuler
                  </Button>
                </ModalClose>
                <Button type="button" onClick={saveQuota} loading={pending}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </ModalContent>
        </Modal>
      </td>
    </tr>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "muted" | "success" | "danger";
}) {
  const tones: Record<typeof tone, string> = {
    accent: "border-accent/40 bg-accent/10 text-accent",
    muted: "border-glass-border bg-glass text-text-lo",
    success: "border-success/40 bg-success/10 text-success",
    danger: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}
