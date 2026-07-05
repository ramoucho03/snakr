import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Centered shell for every auth screen. The global Aurora backdrop and Toaster
 * already live in the root layout, so this only lays out the chrome: a top bar
 * (logo → home, theme toggle) and a vertically centered `max-w-md` column.
 * `(auth)` is a route group, so it adds no URL segment.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="Retour à l’accueil"
          className="rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
        >
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
