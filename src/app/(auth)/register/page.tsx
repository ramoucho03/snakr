import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { isRegistrationOpen } from "@/lib/settings";
import { GlassCard } from "@/components/ui/glass-card";
import { buttonClass } from "@/components/ui/button";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Inscription" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/drive");

  if (!(await isRegistrationOpen())) {
    return (
      <GlassCard strong className="flex flex-col gap-6 p-7 sm:p-9">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text-hi">
            Inscriptions <span className="brand-text">fermées</span>
          </h1>
          <p className="text-sm text-text-lo">
            La création de compte est actuellement désactivée sur cette
            instance. Contactez l’administrateur pour obtenir un accès.
          </p>
        </header>

        <Link
          href="/login"
          className={buttonClass({
            variant: "outline",
            size: "lg",
            className: "w-full",
          })}
        >
          Retour à la connexion
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard strong sheen className="p-7 sm:p-9">
      <RegisterForm />
    </GlassCard>
  );
}
