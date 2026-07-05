"use client";

import { useRouter } from "next/navigation";
import { LogOut, Shield, KeyRound, Share2, HardDrive, Users, Tv, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownLabel,
} from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/avatar";
import { logout } from "@/app/(auth)/actions";

export interface UserMenuUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
  avatarKey: string | null;
  handle: string | null;
}

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter();
  const label = user.displayName || user.email;
  const channelHref = `/channel/${user.handle ?? user.id}`;
  const go = (href: string) => () => router.push(href);

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label="Menu du compte"
        >
          <Avatar userId={user.id} name={label} hasAvatar={user.avatarKey != null} size={40} ring />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="min-w-60">
        <DropdownLabel>
          <span className="block truncate text-text-hi">{label}</span>
          <span className="block truncate text-text-faint">
            {user.handle ? `@${user.handle}` : user.email}
          </span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem onSelect={go(channelHref)}>
          <Tv size={16} /> Ma chaîne
        </DropdownItem>
        <DropdownItem onSelect={go("/drive")}>
          <HardDrive size={16} /> Mon espace
        </DropdownItem>
        <DropdownItem onSelect={go("/drive/shared")}>
          <Users size={16} /> Partagés avec moi
        </DropdownItem>
        <DropdownItem onSelect={go("/drive/shares")}>
          <Share2 size={16} /> Mes partages
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={go("/settings")}>
          <Settings size={16} /> Paramètres
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
