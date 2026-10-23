'use client';

import { ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteDiscussionAction } from '@/app/(app)/discussions/actions';
import { AlertDialog, GlassCard, IconButton, toast, trackSpot } from '@/components/verre';

// « Vos discussions » : une ligne par discussion, la plus récente d'abord. La date relative est calculée par le
// serveur (pas d'écart d'hydratation à la minute près). Chaque ligne peut être supprimée, après confirmation.
export type DiscussionRow = { id: string; title: string; updatedAt: string; when: string };

export function DiscussionRows({ rows }: { rows: DiscussionRow[] }) {
  const [asked, setAsked] = useState<DiscussionRow | null>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();
  const shown = rows.filter((d) => !gone.has(d.id));

  const remove = (row: DiscussionRow) =>
    startTransition(async () => {
      // retirée tout de suite de la liste ; remise si le serveur refuse
      setGone((ids) => new Set(ids).add(row.id));
      try {
        const { ok } = await deleteDiscussionAction(row.id);
        if (ok) {
          toast.success('Discussion supprimée.');
          return;
        }
      } catch {
        // même message qu'un refus
      }
      setGone((ids) => {
        const next = new Set(ids);
        next.delete(row.id);
        return next;
      });
      toast.error('Impossible de supprimer cette discussion. Réessayez.');
    });

  if (shown.length === 0) return null;

  return (
    <>
      <GlassCard className="p-1.5">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
          {shown.map((d) => (
            <li
              key={d.id}
              className="group/row relative flex items-center [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
            >
              <Link
                href={`/discussions/${d.id}`}
                onPointerMove={trackSpot}
                className="spot-host group flex min-h-[58px] min-w-0 flex-1 items-center gap-3.5 rounded-field px-3 py-2.5 transition-colors duration-200 hover:bg-hover sm:gap-4"
              >
                <span className="spot" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 truncate text-body font-medium text-fg sm:flex-1">
                    {d.title}
                  </span>
                  <time
                    dateTime={d.updatedAt}
                    className="shrink-0 text-meta tabular-nums text-muted"
                  >
                    {d.when}
                  </time>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-fg"
                  strokeWidth={1.7}
                />
              </Link>
              {/* Au survol ou au clavier sur un écran à souris ; toujours visible au doigt, qui ne survole pas. */}
              <IconButton
                icon={Trash2}
                label={`Supprimer « ${d.title} »`}
                tooltip={false}
                onClick={() => setAsked(d)}
                className="ml-1 shrink-0 text-muted transition-opacity duration-200 hover:text-destructive focus-visible:opacity-100 pointer-coarse:size-11 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100"
              />
            </li>
          ))}
        </ul>
      </GlassCard>
      <AlertDialog
        open={asked !== null}
        onOpenChange={(open) => {
          if (!open) setAsked(null);
        }}
        title={`Supprimer « ${asked?.title ?? ''} » ?`}
        description="La discussion et tous ses messages seront effacés. Cette action est définitive."
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (asked) remove(asked);
        }}
      />
    </>
  );
}
