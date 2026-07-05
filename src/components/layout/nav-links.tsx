"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardDrive, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/drive", label: "Drive", icon: HardDrive, prefix: "/drive" },
  { href: "/videos", label: "Vidéos", icon: Clapperboard, prefix: "/videos" },
] as const;

/** Primary section tabs in the app header, with active-route highlighting. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon, prefix }) => {
        const active = pathname === prefix || pathname.startsWith(`${prefix}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0",
              active ? "glass text-text-hi" : "text-text-lo hover:bg-glass hover:text-text-hi",
            )}
          >
            <Icon size={16} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
