"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { register } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-hi">
          Créer un <span className="brand-text">compte</span>
        </h1>
        <p className="text-sm text-text-lo">
          Rejoignez Snak’r et partagez vos fichiers en toute sécurité.
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
          label="Nom affiché"
          htmlFor="displayName"
          error={state.fieldErrors?.displayName}
          required
        >
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            placeholder="Camille Martin"
            aria-invalid={state.fieldErrors?.displayName ? true : undefined}
          />
        </Field>

        <Field
          label="Mot de passe"
          htmlFor="password"
          error={state.fieldErrors?.password}
          hint="10 caractères minimum"
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
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
          Créer mon compte
        </Button>
      </form>

      <p className="text-center text-sm text-text-lo">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="font-medium text-accent transition-opacity hover:opacity-80"
        >
          Se connecter
        </Link>
      </p>
    </motion.div>
  );
}
