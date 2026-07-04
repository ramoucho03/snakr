"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { updateSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const GB = 1024 ** 3;

/** bytes -> GB string for the input (empty when unlimited). */
function bytesToGb(bytes: number | null): string {
  if (bytes == null) return "";
  const gb = bytes / GB;
  // Trim trailing zeros for a friendly display (e.g. "5", not "5.000").
  return String(Number(gb.toFixed(3)));
}

export function SettingsForm({
  initial,
}: {
  initial: { registrationOpen: boolean; defaultQuotaBytes: number | null };
}) {
  const [registrationOpen, setRegistrationOpen] = useState(initial.registrationOpen);
  const [quotaGb, setQuotaGb] = useState(bytesToGb(initial.defaultQuotaBytes));
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = quotaGb.trim();
    const n = Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(n) || n < 0)) {
      toast.error("Quota invalide : entrez un nombre positif de Go, ou laissez vide.");
      return;
    }
    const defaultQuotaBytes = trimmed === "" ? null : Math.round(n * GB);

    startTransition(async () => {
      const res = await updateSettings({ registrationOpen, defaultQuotaBytes });
      if (res.ok) toast.success("Paramètres enregistrés.");
      else toast.error(res.error);
    });
  }

  return (
    <GlassCard className="p-0">
      <form onSubmit={onSubmit} className="flex flex-col gap-5 p-5">
        {/* Registration toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-glass text-text-lo">
              <UserPlus size={18} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-text-hi">Inscriptions ouvertes</p>
              <p className="text-xs text-text-faint">
                Autoriser la création de compte en libre-service.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={registrationOpen}
            aria-label="Inscriptions ouvertes"
            onClick={() => setRegistrationOpen((v) => !v)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              registrationOpen ? "bg-accent" : "border border-glass-border bg-glass",
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                registrationOpen && "translate-x-5",
              )}
            />
          </button>
        </div>

        <div className="h-px bg-glass-border" />

        {/* Default quota */}
        <Field
          label="Quota par défaut (Go)"
          hint="Appliqué aux nouveaux comptes. Laisser vide pour un stockage illimité."
        >
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="Illimité"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
            className="max-w-48"
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
