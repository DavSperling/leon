import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { PAGE, PageHeader } from '@/components/page-header';
import { ChannelLines, SourcesPagination, SourcesTable } from '@/components/sources-table';
import { cn } from '@/lib/utils';
import { requireUserContext } from '@/server/auth/session';
import { listSources } from '@/server/memory/sources';

export const metadata: Metadata = { title: 'Sources' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Une borne pour l'adresse : un numéro démesuré (« ?page=99999999999999999999 ») ne part pas en décalage à la base.
const PAGE_LIMIT = 10_000;

export default async function SourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).page;
  const asked = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 1;
  const page = Math.min(Math.max(asked, 1), PAGE_LIMIT);
  const ctx = await requireUserContext();
  const { channels, sources, hasNext } = await listSources(ctx, page);
  return (
    <div className={cn(PAGE, 'space-y-6')}>
      <PageHeader
        title="Sources"
        description="Les conversations brutes restent privées ; ce que lisent les connexions est visible de l’équipe."
      />
      <ChannelLines channels={channels} />
      {sources.length === 0 && page === 1 ? (
        <EmptyState
          reason="Aucune conversation captée."
          nextStep="Installez l'extension ou lancez pnpm leon import-claude-code."
        />
      ) : sources.length === 0 ? (
        <EmptyState
          reason="Cette page est vide."
          nextStep="Les sources s'arrêtent avant : revenez à la page précédente."
        />
      ) : (
        <SourcesTable sources={sources} />
      )}
      <SourcesPagination page={page} hasNext={hasNext} />
    </div>
  );
}
