"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Clapperboard, CloudUpload, ArrowUpDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import type { VideoItem } from "./types";
import { VideoCard } from "./video-card";

type FilterKey = "all" | "mine" | "shared" | "starred";
type SortKey = "recent" | "oldest" | "name" | "size";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "mine", label: "Mes vidéos" },
  { key: "shared", label: "Partagées avec moi" },
  { key: "starred", label: "Favoris" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Plus récentes" },
  { key: "oldest", label: "Plus anciennes" },
  { key: "name", label: "Nom (A→Z)" },
  { key: "size", label: "Taille" },
];

function matchesFilter(v: VideoItem, filter: FilterKey): boolean {
  switch (filter) {
    case "mine":
      return v.owned;
    case "shared":
      return !v.owned;
    case "starred":
      return v.starred;
    default:
      return true;
  }
}

function sortVideos(list: VideoItem[], sort: SortKey): VideoItem[] {
  const copy = [...list];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    case "size":
      return copy.sort((a, b) => b.size - a.size);
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function VideoHub({ videos }: { videos: VideoItem[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = videos.filter(
      (v) =>
        matchesFilter(v, filter) &&
        (term === "" ||
          v.name.toLowerCase().includes(term) ||
          v.ownerName.toLowerCase().includes(term)),
    );
    return sortVideos(filtered, sort);
  }, [videos, q, filter, sort]);

  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* Title + search */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Clapperboard size={26} className="text-accent" aria-hidden />
          <h1 className="font-display text-2xl font-semibold text-text-hi">Vidéos</h1>
          <span className="tabular ml-1 rounded-full bg-glass px-2.5 py-0.5 text-xs text-text-lo">
            {videos.length}
          </span>
        </div>

        <div className="relative w-full max-w-xl">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une vidéo…"
            className="h-11 rounded-full pl-11"
            aria-label="Rechercher une vidéo"
            type="search"
          />
        </div>
      </div>

      {/* Filter chips + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "bg-text-hi text-bg-0"
                : "glass text-text-lo hover:text-text-hi",
            )}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownTrigger asChild>
              <button className={buttonClass({ variant: "secondary", size: "sm" })}>
                <ArrowUpDown size={15} aria-hidden />
                <span className="hidden sm:inline">{sortLabel}</span>
              </button>
            </DropdownTrigger>
            <DropdownContent align="end" className="min-w-48">
              {SORTS.map((s) => (
                <DropdownItem key={s.key} onSelect={() => setSort(s.key)}>
                  <Check
                    size={15}
                    className={cn(sort === s.key ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  {s.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Grid / empty states */}
      {videos.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="Aucune vidéo pour l'instant"
          description="Importez des vidéos dans votre drive : elles apparaîtront ici, prêtes à être regardées."
          action={
            <Link href="/drive" className={buttonClass({ variant: "primary" })}>
              <CloudUpload size={16} /> Importer des vidéos
            </Link>
          }
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description={q.trim() ? `Rien ne correspond à « ${q.trim()} ».` : "Aucune vidéo dans ce filtre."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
