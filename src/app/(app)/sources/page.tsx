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
    <div className="mx-auto w-full max-w-[1000px] space-y-8 px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Les conversations brutes restent privées ; ce que lisent les connexions est visible de
          l'équipe.
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
