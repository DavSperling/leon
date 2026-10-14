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
    <div className="mx-auto w-full max-w-[1000px] space-y-6 px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="flex items-end justify-between gap-4 border-b pb-7">
        <div>
          <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Journal</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Qui a lu quelle fiche, et avec quel assistant
          </p>
        </div>
        {(fiche || before) && (
          <Link
            href="/journal"
            className="text-[15px] leading-6 text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            Voir toutes les lectures récentes
          </Link>
        )}
      </header>
      {fiche && entries[0] && (
        <p className="text-[15px] leading-6 text-muted-foreground">
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
        <Button asChild variant="outline" className="rounded-lg">
          <Link href={`/journal?${next}`}>Voir plus</Link>
        </Button>
      )}
    </div>
  );
}
