'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { GlassCard, trackSpot } from '@/components/verre';

// « Vos discussions » : une ligne par discussion, la plus récente d'abord. La date relative est calculée par le
// serveur (pas d'écart d'hydratation à la minute près).
export type DiscussionRow = { id: string; title: string; updatedAt: string; when: string };

export function DiscussionRows({ rows }: { rows: DiscussionRow[] }) {
  return (
    <GlassCard className="p-1.5">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
        {rows.map((d) => (
          <li
            key={d.id}
            className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
          >
            <Link
              href={`/discussions/${d.id}`}
              onPointerMove={trackSpot}
              className="spot-host group flex min-h-[58px] items-center gap-3.5 rounded-field px-3 py-2.5 transition-colors duration-200 hover:bg-hover sm:gap-4"
            >
              <span className="spot" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 truncate text-body font-medium text-fg sm:flex-1">
                  {d.title}
                </span>
                <time dateTime={d.updatedAt} className="shrink-0 text-meta tabular-nums text-muted">
                  {d.when}
                </time>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:text-fg"
                strokeWidth={1.7}
              />
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
