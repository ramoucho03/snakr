"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardDrive, Star, Users, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/drive", label: "Mes fichiers", icon: HardDrive },
  { href: "/drive/starred", label: "Favoris", icon: Star },
  { href: "/drive/shared", label: "Partagés avec moi", icon: Users },
  { href: "/drive/shares", label: "Mes partages", icon: Link2 },
] as const;

/** "Mes fichiers" owns every /drive route the three other tabs don't claim. */
function isActive(tab: (typeof TABS)[number]["href"], pathname: string): boolean {
  if (tab === "/drive") {
    return (
      pathname.startsWith("/drive") &&
      !pathname.startsWith("/drive/starred") &&
      !pathname.startsWith("/drive/shared") &&
      !pathname.startsWith("/drive/shares")
    );
  }
  return pathname === tab || pathname.startsWith(`${tab}/`);
}

/** Drive sub-sections, right under the app header on every /drive page. */
export function DriveTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex items-center gap-1 overflow-x-auto" aria-label="Sections du drive">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active ? "glass text-text-hi" : "text-text-lo hover:bg-glass hover:text-text-hi",
            )}
          >
            <Icon size={15} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
