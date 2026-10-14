import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatRelative } from '@/lib/format';
import { requireUserContext } from '@/server/auth/session';
import { buildBriefing } from '@/server/memory/briefing';

export default async function HomePage() {
  const ctx = await requireUserContext();
  const { entries } = await buildBriefing(ctx);

  return (
    <div className="mx-auto w-full max-w-[780px] px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Briefing</h1>
        <p className="mt-1 text-base text-muted-foreground">Ce qui a changé ces 7 derniers jours</p>
      </header>
      {entries.length === 0 ? (
        <EmptyState
          reason="Aucune fiche modifiée ces 7 derniers jours."
          nextStep="Leon crée les fiches à partir de vos conversations captées."
        >
          <Button asChild variant="outline" size="sm">
            <Link href="/reglages">Brancher une source</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="-mx-4 mt-6 space-y-1">
          {entries.map((entry) => (
            <li key={entry.cardId}>
              <Link
                href={`/fiches/${entry.cardId}`}
                className="group block space-y-1.5 rounded-xl px-4 py-4 transition-colors duration-150 hover:bg-muted"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[17px] leading-6 font-semibold tracking-tight group-hover:text-primary">
                    {entry.title}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {entry.typeLabel}
                  </span>
                  <time
                    dateTime={entry.lastFactAt.toISOString()}
                    title={formatDateTime(entry.lastFactAt)}
                    className="ml-auto shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums"
                  >
                    {formatRelative(entry.lastFactAt)}
                  </time>
                </div>
                <p className="text-base leading-7 text-foreground-2 text-pretty">
                  {entry.latestStatement}
                </p>
                {entry.hasConflict && <StatusBadge status="conflict" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
