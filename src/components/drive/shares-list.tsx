"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2, FileText, Folder, Download, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { formatDate, cn } from "@/lib/utils";
import { revokeShareAction } from "@/app/drive/actions";

export interface ShareRow {
  id: string;
  note: string | null;
  targetName: string;
  targetType: "FILE" | "FOLDER" | "UNKNOWN";
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  revoked: boolean;
  createdAt: string;
}

function statusOf(s: ShareRow): { label: string; tint: string } {
  if (s.revoked) return { label: "Révoqué", tint: "text-danger bg-danger/10" };
  if (s.expiresAt && new Date(s.expiresAt) < new Date())
    return { label: "Expiré", tint: "text-warning bg-warning/10" };
  if (s.maxDownloads != null && s.downloadCount >= s.maxDownloads)
    return { label: "Épuisé", tint: "text-warning bg-warning/10" };
  return { label: "Actif", tint: "text-success bg-success/10" };
}

export function SharesList({ shares }: { shares: ShareRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function revoke(id: string) {
    start(async () => {
      const r = await revokeShareAction({ shareId: id });
      if (r.ok) {
        toast.success("Partage révoqué");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (shares.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="Aucun partage"
        description="Partagez un fichier ou un dossier depuis votre drive pour créer un lien."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {shares.map((s) => {
        const status = statusOf(s);
        const Icon = s.targetType === "FOLDER" ? Folder : FileText;
        return (
          <GlassCard key={s.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-glass">
              <Icon size={20} className="text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-text-hi">{s.targetName}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", status.tint)}>
                  {status.label}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Download size={12} />
                  {s.downloadCount}
                  {s.maxDownloads != null ? ` / ${s.maxDownloads}` : ""}
                </span>
                {s.expiresAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> expire le {formatDate(s.expiresAt)}
                  </span>
                )}
                <span>créé le {formatDate(s.createdAt)}</span>
              </div>
              {s.note && <p className="mt-1 truncate text-xs text-text-lo">« {s.note} »</p>}
            </div>
            {!s.revoked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke(s.id)}
                disabled={pending}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 size={15} /> Révoquer
              </Button>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
