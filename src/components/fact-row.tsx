import { Lock, Users } from 'lucide-react';
import Link from 'next/link';
import { QuoteBlock } from '@/components/quote-block';
import { SourceChip } from '@/components/source-chip';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FactView } from '@/server/memory/card-data';

// « depuis le … », « à partir du … » (fait futur) ou « remplacé le … » (fait remplacé et terminé).
export function validityLabel(
  fact: Pick<FactView, 'status' | 'validFrom' | 'validTo'>,
  now: Date = new Date(),
): string {
  if (fact.status === 'superseded' && fact.validTo && fact.validTo <= now) {
    return `remplacé le ${formatDate(fact.validTo)}`;
  }
  return `${fact.validFrom > now ? 'à partir du' : 'depuis le'} ${formatDate(fact.validFrom)}`;
}

function Visibility({ visibility }: { visibility: FactView['visibility'] }) {
  const Icon = visibility === 'team' ? Users : Lock;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      {visibility === 'team' ? 'Équipe' : 'Privé (vous)'}
    </span>
  );
}

// Un fait : prédicat, énoncé, validité, statut, citation, source et visibilité.
export function FactRow({ fact }: { fact: FactView }) {
  return (
    <li className="grid grid-cols-[160px_minmax(0,1fr)_160px] gap-x-4 border-b py-3">
      <p className="pt-[3px] text-[13px] leading-[18px] text-muted-foreground">
        {fact.predicateLabel}
      </p>
      <div className="space-y-2">
        <p
          className={cn(
            'max-w-[72ch] text-[15px] leading-6',
            fact.status === 'superseded' && 'text-muted-foreground',
          )}
        >
          {fact.statement}
        </p>
        <QuoteBlock quote={fact.quote} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <SourceChip
            kind={fact.sourceKind}
            label={fact.sourceKindLabel}
            authorName={fact.authorName}
            at={fact.recordedAt}
          />
          <Visibility visibility={fact.visibility} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 pt-[3px]">
        <time
          dateTime={fact.validFrom.toISOString()}
          title={formatDateTime(fact.validFrom)}
          className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {validityLabel(fact)}
        </time>
        {fact.status !== 'active' && <StatusBadge status={fact.status} />}
        {fact.status === 'conflict' && (
          <Link
            href="/a-verifier"
            className="text-[13px] leading-[18px] text-primary hover:underline"
          >
            À vérifier →
          </Link>
        )}
      </div>
    </li>
  );
}
