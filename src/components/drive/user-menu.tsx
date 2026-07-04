"use client";

import { useRouter } from "next/navigation";
import { LogOut, Shield, KeyRound, Share2, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownLabel,
} from "@/components/ui/dropdown";
import { initials } from "@/lib/utils";
import { logout } from "@/app/(auth)/actions";

export interface UserMenuUser {
  email: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
}

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter();
  const label = user.displayName || user.email;
  const go = (href: string) => () => router.push(href);

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          className="glass grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-text-hi outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label="Menu du compte"
        >
          {initials(label)}
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="min-w-56">
        <DropdownLabel>
          <span className="block truncate text-text-hi">{label}</span>
          <span className="block truncate text-text-faint">{user.email}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem onSelect={go("/drive")}>
          <User size={16} /> Mon drive
        </DropdownItem>
        <DropdownItem onSelect={go("/drive/shares")}>
          <Share2 size={16} /> Mes partages
        </DropdownItem>
        {user.role === "ADMIN" && (
          <DropdownItem onSelect={go("/admin")}>
            <Shield size={16} /> Administration
          </DropdownItem>
        )}
        <DropdownItem onSelect={go("/change-password")}>
          <KeyRound size={16} /> Mot de passe
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger onSelect={() => void logout()}>
          <LogOut size={16} /> Se déconnecter
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
