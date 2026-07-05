"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { login } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-hi">
          Bon retour <span className="brand-text">parmi nous</span>
        </h1>
        <p className="text-sm text-text-lo">
          Connectez-vous pour accéder à vos fichiers.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {state.error}
          </p>
        )}

        <input type="hidden" name="next" value={next ?? ""} />

        <Field
          label="Adresse e-mail"
          htmlFor="email"
          error={state.fieldErrors?.email}
          required
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="vous@exemple.fr"
            aria-invalid={state.fieldErrors?.email ? true : undefined}
          />
        </Field>

        <Field
          label="Mot de passe"
          htmlFor="password"
          error={state.fieldErrors?.password}
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            aria-invalid={state.fieldErrors?.password ? true : undefined}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={pending}
          className="mt-1 w-full"
        >
          Se connecter
        </Button>
      </form>

      <p className="text-center text-sm text-text-lo">
        Pas encore de compte ?{" "}
        <Link
          href="/register"
          className="font-medium text-accent transition-opacity hover:opacity-80"
        >
          Créer un compte
        </Link>
      </p>
    </motion.div>
  );
}
