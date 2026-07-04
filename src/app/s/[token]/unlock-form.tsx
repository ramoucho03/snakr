"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { unlockShare, type UnlockState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Déverrouiller
    </Button>
  );
}

export function UnlockForm({ token }: { token: string }) {
  const [state, action] = useActionState<UnlockState, FormData>(unlockShare, {});
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-glass">
        <Lock size={24} className="text-accent" />
      </div>
      <div className="text-center">
        <h1 className="font-display text-xl font-semibold text-text-hi">Partage protégé</h1>
        <p className="mt-1 text-sm text-text-lo">
          Saisissez le mot de passe pour accéder à ce partage.
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      <Field error={state.error}>
        <Input
          name="password"
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="Mot de passe"
          aria-invalid={Boolean(state.error)}
        />
      </Field>
      <Submit />
    </form>
  );
}
