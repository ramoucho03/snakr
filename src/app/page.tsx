import { getCurrentUser } from "@/lib/dal";
import { LogoMark } from "@/components/ui/logo";
import { TopNav } from "@/components/landing/top-nav";
import { HeroReveals } from "@/components/landing/hero-reveals";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { CtaBand } from "@/components/landing/cta-band";

export default async function Home() {
  const user = await getCurrentUser();
  const authed = user !== null;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <TopNav authed={authed} />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
          <HeroReveals authed={authed} />
        </section>

        {/* Feature grid */}
        <section id="fonctionnalites" className="px-4 pb-28 sm:px-6">
          <FeatureGrid />
        </section>

        {/* Closing call to action */}
        <section className="px-4 pb-28 sm:px-6">
          <CtaBand authed={authed} />
        </section>
      </main>

      <footer className="border-t border-glass-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-text-faint sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={22} />
            Snak&apos;r — © 2026
          </span>
          <span className="font-display tracking-[-0.01em]">
            We ride, we partage.
          </span>
        </div>
      </footer>
    </div>
  );
}
