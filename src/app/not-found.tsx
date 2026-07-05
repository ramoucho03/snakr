import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { GlassCard } from "@/components/ui/glass-card";

export const metadata = { title: "Page introuvable" };

const CTA =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium " +
  "text-[var(--accent-contrast)] shadow-[0_8px_24px_-8px_var(--accent)] transition hover:brightness-110";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-4 py-3">
        <Link href="/" aria-label="Snak'r">
          <Logo size={30} />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <GlassCard strong className="flex max-w-md flex-col items-center gap-4 py-10 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-glass">
            <Compass size={30} className="text-accent" />
          </div>
          <p className="font-display text-5xl font-semibold text-text-hi">404</p>
          <h1 className="font-display text-xl font-semibold text-text-hi">Page introuvable</h1>
          <p className="max-w-sm text-sm text-text-lo">
            Cette page n'existe pas ou a été déplacée. Vérifiez le lien ou revenez à l'accueil.
          </p>
          <Link href="/" className={`${CTA} mt-2`}>
            Retour à l'accueil
          </Link>
        </GlassCard>
      </main>
    </div>
  );
}
