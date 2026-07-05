"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Link2, Globe, ChevronDown, Check, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { setVisibilityAction } from "@/app/(video)/actions";
import type { VideoVisibility } from "./types";

const OPTIONS: {
  key: VideoVisibility;
  label: string;
  hint: string;
  icon: typeof Lock;
}[] = [
  { key: "PRIVATE", label: "Privée", hint: "Vous et les personnes autorisées", icon: Lock },
  { key: "UNLISTED", label: "Non répertoriée", hint: "Toute personne ayant le lien", icon: Link2 },
  { key: "PUBLIC", label: "Publique", hint: "Visible sur votre chaîne, sans compte", icon: Globe },
];

/** Owner-only control to set a video's visibility (drives public /watch access). */
export function VisibilityMenu({
  fileId,
  initial,
  onChange,
}: {
  fileId: string;
  initial: VideoVisibility;
  onChange?: (v: VideoVisibility) => void;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<VideoVisibility>(initial);
  const [pending, start] = useTransition();

  const current = OPTIONS.find((o) => o.key === visibility) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  function choose(v: VideoVisibility) {
    if (v === visibility) return;
    const prev = visibility;
    setVisibility(v);
    onChange?.(v);
    start(async () => {
      const res = await setVisibilityAction({ fileId, visibility: v });
      if (!res.ok) {
        setVisibility(prev);
        onChange?.(prev);
        toast.error(res.error);
      } else {
        toast.success(
          v === "PUBLIC" ? "Vidéo publiée" : v === "UNLISTED" ? "Lien activé" : "Vidéo privée",
        );
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-2 text-sm font-medium text-text-hi transition-colors hover:bg-glass-strong"
          aria-label="Visibilité de la vidéo"
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <CurrentIcon size={15} className="text-accent" aria-hidden />
          )}
          <span>{current.label}</span>
          <ChevronDown size={14} className="text-text-faint" aria-hidden />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="min-w-72">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = o.key === visibility;
          return (
            <DropdownItem key={o.key} onSelect={() => choose(o.key)} className="items-start gap-3">
              <Icon size={16} className={cn("mt-0.5 shrink-0", active ? "text-accent" : "text-text-lo")} />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-text-hi">
                  {o.label}
                  {active && <Check size={13} className="text-accent" aria-hidden />}
                </span>
                <span className="text-xs text-text-faint">{o.hint}</span>
              </span>
            </DropdownItem>
          );
        })}
      </DropdownContent>
    </DropdownMenu>
  );
}
