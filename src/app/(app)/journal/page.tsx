import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import { ReadLogTable } from '@/components/read-log-table';
import { Button } from '@/components/ui/button';
import { requireUserContext } from '@/server/auth/session';
import { listReadLog } from '@/server/memory/read-log';

export const metadata: Metadata = { title: 'Journal' };

const PAGE_SIZE = 50;
// Un paramètre absent ou mal formé est ignoré : la page montre alors le début du journal.
const SearchParamsSchema = z.object({
  fiche: z.uuid().optional().catch(undefined),
  before: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional()
    .catch(undefined),
});

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fiche, before } = SearchParamsSchema.parse(await searchParams);
  const ctx = await requireUserContext();
  // Une lecture de plus que la page : elle dit s'il y a une suite.
  const rows = await listReadLog(ctx, { cardId: fiche, before, limit: PAGE_SIZE + 1 });
  const entries = rows.slice(0, PAGE_SIZE);
  const last = entries.at(-1);

  const next = new URLSearchParams();
  if (fiche) next.set('fiche', fiche);
  if (last) next.set('before', last.at.toISOString());

  return (
    <div className="max-w-4xl space-y-4 p-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-base leading-6 font-semibold">Journal</h1>
        {(fiche || before) && (
          <Link href="/journal" className="text-[13px] leading-[18px] text-primary hover:underline">
            Voir toutes les lectures récentes
          </Link>
        )}
      </header>
      {fiche && entries[0] && (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Lectures de la fiche «&nbsp;{entries[0].cardTitle}&nbsp;» seulement.
        </p>
      )}
      {entries.length === 0 ? (
        <EmptyState
          reason="Aucun assistant n'a encore lu de fiche."
          nextStep="Les lectures apparaissent ici dès qu'un assistant ouvre une fiche."
        />
      ) : (
        <ReadLogTable entries={entries} />
      )}
      {rows.length > PAGE_SIZE && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/journal?${next}`}>Voir plus</Link>
        </Button>
      )}
    </div>
  );
}
