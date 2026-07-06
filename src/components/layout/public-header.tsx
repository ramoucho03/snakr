import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button-variants";

export interface PublicViewer {
  id: string;
  displayName: string | null;
  email: string;
  avatarKey: string | null;
  handle: string | null;
}

/**
 * Top bar for the public, no-auth-required surfaces (a shared /watch page and
 * channel pages). Adapts to the viewer: signed-in members get a link back into
 * the app and their avatar; visitors get sign-in / register calls to action.
 */
export function PublicHeader({ viewer }: { viewer: PublicViewer | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-bg-0/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[110rem] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href={viewer ? "/videos" : "/"} aria-label="Snak'r" className="shrink-0">
          <Logo size={30} />
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {viewer ? (
            <>
              <Link
                href="/videos"
                className={buttonClass({ variant: "secondary", size: "sm", className: "rounded-full" })}
              >
                Espace vidéos
              </Link>
              <Avatar
                userId={viewer.id}
                name={viewer.displayName ?? viewer.email}
                hasAvatar={viewer.avatarKey != null}
                size={36}
                href={`/channel/${viewer.handle ?? viewer.id}`}
                ring
              />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonClass({ variant: "ghost", size: "sm", className: "hidden sm:inline-flex" })}
              >
                Se connecter
              </Link>
              <Link
                href="/register"
                className={buttonClass({ variant: "primary", size: "sm", className: "rounded-full" })}
              >
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
