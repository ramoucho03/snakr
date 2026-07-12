"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatViews, formatRelative } from "@/lib/utils";
import { setDescriptionAction } from "@/app/(video)/actions";

/**
 * The info card under the player: view count + publish date, then the video
 * description (expandable), with inline editing for anyone with write access.
 */
export function DescriptionPanel({
  fileId,
  initialDescription,
  viewCount,
  createdAt,
  canEdit,
}: {
  fileId: string;
  initialDescription: string | null;
  viewCount: number;
  createdAt: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();

  const longText = description.length > 220 || description.split("\n").length > 3;

  function save() {
    start(async () => {
      const res = await setDescriptionAction({ fileId, description: draft });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        setDescription(res.description);
        setEditing(false);
        toast.success("Description enregistrée");
        router.refresh();
      }
    });
  }

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-hi">
          <span className="tabular">{formatViews(viewCount)}</span>
          <span className="mx-1.5 text-text-faint">·</span>
          <span className="font-normal text-text-lo">{formatRelative(createdAt)}</span>
        </p>
        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(description);
              setEditing(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-text-lo transition-colors hover:text-text-hi"
          >
            <Pencil size={13} aria-hidden /> Modifier
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Décrivez votre vidéo…"
            autoFocus
            className="w-full resize-y rounded-lg border border-glass-border bg-bg-0/40 px-3 py-2 text-sm text-text-hi outline-none focus:border-accent/60"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} loading={pending}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : description ? (
        <>
          <p
            className={cn(
              // max-w-prose: in theater mode the column grows wide enough that an
              // unbounded paragraph runs well past a comfortable reading measure.
              "mt-2 max-w-prose whitespace-pre-wrap break-words text-sm text-text-lo",
              !expanded && longText && "line-clamp-3",
            )}
          >
            {description}
          </p>
          {longText && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-sm font-medium text-text-hi transition-colors hover:text-accent"
            >
              {expanded ? "Afficher moins" : "…Afficher plus"}
            </button>
          )}
        </>
      ) : canEdit ? (
        <button
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
        >
          <Plus size={15} aria-hidden /> Ajouter une description
        </button>
      ) : (
        <p className="mt-2 text-sm text-text-faint">Aucune description.</p>
      )}

      {pending && !editing && (
        <Loader2 size={14} className="mt-2 animate-spin text-text-faint" aria-hidden />
      )}
    </div>
  );
}
