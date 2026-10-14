import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { ChannelLines, SourcesTable } from '@/components/sources-table';
import { requireUserContext } from '@/server/auth/session';
import { listSources } from '@/server/memory/sources';

export const metadata: Metadata = { title: 'Sources' };

export default async function SourcesPage() {
  const ctx = await requireUserContext();
  const { channels, sources } = await listSources(ctx);
  return (
    <div className="max-w-4xl space-y-4 p-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-base leading-6 font-semibold">Sources</h1>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Les conversations brutes restent privées.
        </p>
      </header>
      <ChannelLines channels={channels} />
      {sources.length === 0 ? (
        <EmptyState
          reason="Aucune conversation captée."
          nextStep="Installez l'extension ou lancez pnpm leon import-claude-code."
        />
      ) : (
        <SourcesTable sources={sources} />
      )}
    </div>
  );
}
