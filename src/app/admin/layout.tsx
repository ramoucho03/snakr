import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/dal";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Security boundary: redirects non-admins to /drive.
  await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-glass-border bg-glass backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo size={30} />
          <span className="hidden h-6 w-px bg-glass-border sm:block" />
          <h1 className="hidden font-display text-base font-semibold text-text-hi sm:block">
            Console d&apos;administration
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/drive"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-lo transition-colors hover:bg-glass hover:text-text-hi"
            >
              <ArrowLeft size={16} aria-hidden />
              <span className="hidden sm:inline">Retour au drive</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
