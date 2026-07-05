import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { StorageMeter } from "@/components/drive/storage-meter";
import { UserMenu, type UserMenuUser } from "@/components/drive/user-menu";
import { NavLinks } from "./nav-links";

/**
 * The shared top bar for every authenticated section (drive + videos). Renders
 * the section tabs, storage meter, theme toggle and account menu. One fluid
 * width everywhere (max-w-[110rem]) so every page fills large screens alike.
 */
export function AppHeader({
  user,
  used,
  limit,
}: {
  user: UserMenuUser;
  used: number;
  limit: number | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-bg-0/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[110rem] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/drive" className="shrink-0" aria-label="Accueil du drive">
            <LogoMark size={30} />
          </Link>
          <NavLinks />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StorageMeter used={used} limit={limit} />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
