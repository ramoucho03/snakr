"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { ShieldAlert } from "lucide-react";
import { changePassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ChangePasswordForm({ mustChange }: { mustChange?: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-hi">
          Changer le <span className="brand-text">mot de passe</span>
        </h1>
        <p className="text-sm text-text-lo">
          Choisissez un nouveau mot de passe robuste.
        </p>
      </header>

      {mustChange && (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm text-warning"
        >
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Vous devez changer votre mot de passe avant de continuer.
          </span>
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {state.error}
          </p>
        )}

        <Field
          label="Mot de passe actuel"
          htmlFor="currentPassword"
          error={state.fieldErrors?.currentPassword}
          required
        >
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            aria-invalid={state.fieldErrors?.currentPassword ? true : undefined}
          />
        </Field>

        <Field
          label="Nouveau mot de passe"
          htmlFor="newPassword"
          error={state.fieldErrors?.newPassword}
          hint="10 caractères minimum"
          required
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            placeholder="••••••••••"
            aria-invalid={state.fieldErrors?.newPassword ? true : undefined}
          />
        </Field>

        <Field
          label="Confirmer le nouveau mot de passe"
          htmlFor="confirm"
          error={state.fieldErrors?.confirm}
          required
        >
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            placeholder="••••••••••"
            aria-invalid={state.fieldErrors?.confirm ? true : undefined}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={pending}
          className="mt-1 w-full text-sm sm:text-base"
        >
          Mettre à jour le mot de passe
        </Button>
      </form>
    </motion.div>
  );
}
