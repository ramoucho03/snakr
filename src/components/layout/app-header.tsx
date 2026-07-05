import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { StorageMeter } from "@/components/drive/storage-meter";
import { UserMenu, type UserMenuUser } from "@/components/drive/user-menu";
import { NavLinks } from "./nav-links";

/**
 * The shared top bar for every authenticated section (drive + videos). Renders
 * the section tabs, storage meter, theme toggle and account menu. `wide` widens
 * the inner container for the immersive video pages; the drive keeps max-w-6xl.
 */
export function AppHeader({
  user,
  used,
  limit,
  wide = false,
}: {
  user: UserMenuUser;
  used: number;
  limit: number | null;
  wide?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-bg-0/70 backdrop-blur-xl">
      <div
        className={cn(
          "mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6",
          wide ? "max-w-[110rem]" : "max-w-6xl",
        )}
      >
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
