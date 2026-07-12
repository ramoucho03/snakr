"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Clapperboard,
  CloudUpload,
  ArrowUpDown,
  Check,
  History,
  Users,
} from "lucide-react";
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
import { getAllProgress } from "./progress";

type FilterKey = "all" | "mine" | "shared" | "starred";
type SortKey = "recent" | "oldest" | "name" | "size";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "mine", label: "Mes vidéos" },
  { key: "shared", label: "Partagées" },
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

// Hide the scrollbar on the horizontal shelves (chips + continue-watching).
const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Debounce the URL write, not the filtering — the grid must stay instant. */
const URL_SYNC_MS = 250;

const isFilter = (v: string | null): v is FilterKey =>
  FILTERS.some((f) => f.key === v);
const isSort = (v: string | null): v is SortKey => SORTS.some((s) => s.key === v);

export function VideoHub({
  videos,
  subscriptions = [],
}: {
  videos: VideoItem[];
  subscriptions?: VideoItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Seeded from the URL so a shared or reloaded link lands on the same view.
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [filter, setFilter] = useState<FilterKey>(() => {
    const raw = params.get("filtre");
    return isFilter(raw) ? raw : "all";
  });
  const [sort, setSort] = useState<SortKey>(() => {
    const raw = params.get("tri");
    return isSort(raw) ? raw : "recent";
  });
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const firstRun = useRef(true);

  // Reflect the view back into the URL. `replace`, not `push`: the browser's
  // Back button should leave the hub, not walk back through every keystroke.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams();
      if (q.trim()) next.set("q", q.trim());
      if (filter !== "all") next.set("filtre", filter);
      if (sort !== "recent") next.set("tri", sort);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, URL_SYNC_MS);
    return () => clearTimeout(timer);
  }, [q, filter, sort, pathname, router]);

  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  // "Continuer à regarder" is client-only (localStorage) → compute after mount.
  useEffect(() => {
    const all = getAllProgress();
    const ids = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id]) => id)
      .filter((id) => byId.has(id));
    setResumeIds(ids);
  }, [byId]);

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

  const continueWatching = useMemo(
    () => resumeIds.map((id) => byId.get(id)).filter((v): v is VideoItem => Boolean(v)).slice(0, 12),
    [resumeIds, byId],
  );

  const showShelf = filter === "all" && q.trim() === "" && continueWatching.length > 0;
  const showSubs = filter === "all" && q.trim() === "" && subscriptions.length > 0;
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header: title + search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Clapperboard size={24} className="text-accent sm:size-7" aria-hidden />
          <h1 className="font-display text-2xl font-semibold text-text-hi sm:text-3xl">Vidéos</h1>
          <span className="tabular ml-1 rounded-full bg-glass px-2.5 py-0.5 text-xs text-text-lo">
            {videos.length}
          </span>
        </div>

        <div className="relative w-full sm:max-w-sm">
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

      {/* Category chips (scroll on mobile) + sort */}
      <div className="flex items-center gap-2">
        <div className={cn("flex flex-1 gap-2 overflow-x-auto pb-1", HIDE_SCROLLBAR)}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-text-hi text-bg-0"
                  : "glass text-text-lo hover:text-text-hi",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="shrink-0">
          <DropdownMenu>
            <DropdownTrigger asChild>
              <button
                className={buttonClass({ variant: "secondary", size: "sm" })}
                aria-label="Trier"
              >
                <ArrowUpDown size={15} aria-hidden />
                <span className="hidden md:inline">{sortLabel}</span>
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

      {/* New from subscriptions shelf */}
      {showSubs && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-hi">
            <Users size={18} className="text-accent" aria-hidden /> Nouveautés de vos abonnements
          </h2>
          <div className={cn("-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0", HIDE_SCROLLBAR)}>
            {subscriptions.slice(0, 12).map((v) => (
              <div key={v.id} className="w-64 shrink-0 snap-start sm:w-72">
                <VideoCard video={v} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Continue watching shelf */}
      {showShelf && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-hi">
            <History size={18} className="text-tan" aria-hidden /> Continuer à regarder
          </h2>
          <div className={cn("-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0", HIDE_SCROLLBAR)}>
            {continueWatching.map((v) => (
              <div key={v.id} className="w-64 shrink-0 snap-start sm:w-72">
                <VideoCard video={v} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main library */}
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
        <section className="flex flex-col gap-3">
          {showShelf && (
            <h2 className="font-display text-lg font-semibold text-text-hi">Toutes les vidéos</h2>
          )}
          <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {results.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
