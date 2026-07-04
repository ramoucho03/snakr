import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Root → current path. `crumbs` excludes the "Mon drive" root (added here). */
export function Breadcrumbs({ crumbs }: { crumbs: { id: string; name: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1 text-sm">
      <Link
        href="/drive"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-lo transition-colors hover:bg-glass hover:text-text-hi",
          crumbs.length === 0 && "text-text-hi",
        )}
      >
        <Home size={15} aria-hidden />
        <span className="font-medium">Mon drive</span>
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={15} className="shrink-0 text-text-faint" aria-hidden />
            <Link
              href={`/drive/${c.id}`}
              aria-current={last ? "page" : undefined}
              className={cn(
                "truncate rounded-lg px-2 py-1 transition-colors hover:bg-glass",
                last ? "font-medium text-text-hi" : "text-text-lo hover:text-text-hi",
              )}
            >
              {c.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
