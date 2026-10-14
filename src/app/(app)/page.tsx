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
    <div className="p-6">
      <h1 className="text-base font-semibold">Briefing</h1>
      <p className="text-[13px] leading-[18px] text-muted-foreground">7 derniers jours</p>
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
        <ul className="mt-4 max-w-[72ch]">
          {entries.map((entry) => (
            <li key={entry.cardId} className="space-y-1 border-b py-3">
              <div className="flex items-baseline gap-2">
                <Link
                  href={`/fiches/${entry.cardId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {entry.title}
                </Link>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {entry.typeLabel}
                </span>
                <time
                  dateTime={entry.lastFactAt.toISOString()}
                  title={formatDateTime(entry.lastFactAt)}
                  className="ml-auto text-[13px] leading-[18px] text-muted-foreground tabular-nums"
                >
                  {formatRelative(entry.lastFactAt)}
                </time>
              </div>
              <p className="text-[15px] leading-6">{entry.latestStatement}</p>
              {entry.hasConflict && <StatusBadge status="conflict" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
