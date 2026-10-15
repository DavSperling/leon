import { Lock, Users } from 'lucide-react';
import Link from 'next/link';
import { QuoteBlock } from '@/components/quote-block';
import { SourceChip } from '@/components/source-chip';
import { SourceLink } from '@/components/source-link';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FactView } from '@/server/memory/card-data';

// « depuis le … », « à partir du … » (fait futur), « remplacé le … » (fait remplacé et terminé)
// ou « terminé le … » (fait terminé sans remplaçant).
export function validityLabel(
  fact: Pick<FactView, 'status' | 'validFrom' | 'validTo'>,
  now: Date = new Date(),
): string {
  if (fact.validTo && fact.validTo <= now) {
    const ended = fact.status === 'superseded' ? 'remplacé le' : 'terminé le';
    return `${ended} ${formatDate(fact.validTo)}`;
  }
  return `${fact.validFrom > now ? 'à partir du' : 'depuis le'} ${formatDate(fact.validFrom)}`;
}

function Visibility({ visibility }: { visibility: FactView['visibility'] }) {
  const Icon = visibility === 'team' ? Users : Lock;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {visibility === 'team' ? 'Équipe' : 'Privé (vous)'}
    </span>
  );
}

// Un fait se lit comme un paragraphe : l'énoncé, la citation, puis en petit la validité,
// la source et la visibilité. Le prédicat est le titre de section, sauf dans l'historique.
export function FactRow({
  fact,
  showPredicate = false,
}: {
  fact: FactView;
  showPredicate?: boolean;
}) {
  return (
    <li className="space-y-3.5">
      <p
        className={cn(
          'text-[17px] leading-8 text-pretty',
          fact.status === 'superseded' && 'text-muted-foreground',
        )}
      >
        {showPredicate && <span className="mr-2 font-medium">{fact.predicateLabel} :</span>}
        {fact.statement}
      </p>
      <QuoteBlock quote={fact.quote} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-5 text-muted-foreground">
        <time
          dateTime={fact.validFrom.toISOString()}
          title={formatDateTime(fact.validFrom)}
          className="whitespace-nowrap tabular-nums"
        >
          {validityLabel(fact)}
        </time>
        <SourceChip
          kind={fact.sourceKind}
          label={fact.sourceKindLabel}
          authorName={fact.authorName}
          at={fact.recordedAt}
        />
        {fact.sourceUrl && <SourceLink url={fact.sourceUrl} label={fact.sourceKindLabel} />}
        <Visibility visibility={fact.visibility} />
        {fact.status !== 'active' && <StatusBadge status={fact.status} />}
        {fact.status === 'conflict' && (
          <Link href="/a-verifier" className="text-primary hover:underline">
            À vérifier →
          </Link>
        )}
      </div>
    </li>
  );
}
