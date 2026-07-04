import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { storageSummary } from "@/lib/files";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { StorageMeter } from "@/components/drive/storage-meter";
import { UserMenu } from "@/components/drive/user-menu";

export const metadata = { title: "Mon drive" };

export default async function DriveLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Force the password rotation before anything else is reachable.
  if (user.mustChangePw) redirect("/change-password");

  const { used, limit } = await storageSummary(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-glass-border bg-bg-0/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/drive" className="shrink-0" aria-label="Accueil du drive">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-2">
            <StorageMeter used={used} limit={limit} />
            <ThemeToggle />
            <UserMenu
              user={{ email: user.email, displayName: user.displayName, role: user.role }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
