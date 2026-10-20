import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { SourceChip } from '@/components/source-chip';
import { SourceLink } from '@/components/source-link';
import { type BadgeStatus, StatusBadge } from '@/components/status-badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ChannelHealth, SourceRow } from '@/server/memory/sources';

const DAY = 24 * 60 * 60 * 1000;

// Un canal est en retard au-delà de 24 h, mais seulement s'il a déjà capté.
export function channelLine(
  { kindLabel, lastCaptureAt }: ChannelHealth,
  now: Date,
): { text: string; late: boolean } {
  if (!lastCaptureAt) return { text: `${kindLabel} : aucune capture`, late: false };
  const elapsed = now.getTime() - lastCaptureAt.getTime();
  if (elapsed <= DAY) {
    return {
      text: `${kindLabel} : dernière capture ${formatRelative(lastCaptureAt, now)}`,
      late: false,
    };
  }
  return {
    text: `${kindLabel} : aucune capture depuis ${Math.floor(elapsed / DAY)} j`,
    late: true,
  };
}

// Statut du dernier run d'indexation de la source.
export function pipelineStatus(run: SourceRow['lastRun']): BadgeStatus | null {
  if (!run) return null;
  return run.status === 'queued' || run.status === 'running' ? 'running' : run.status;
}

// Message fixe : le message technique de l'erreur n'est jamais montré.
export function failureMessage(): string {
  return 'Échec de l’indexation.';
}

// Les canaux de capture en une bande divisée : le nom, puis l'état ; un canal en retard le dit en couleur.
export function ChannelLines({ channels }: { channels: ChannelHealth[] }) {
  const now = new Date();
  return (
    <section aria-label="Canaux de capture" className="rounded-lg border bg-card">
      <ul
        className="grid divide-x"
        style={{ gridTemplateColumns: `repeat(${channels.length}, minmax(0, 1fr))` }}
      >
        {channels.map((channel) => {
          const { late } = channelLine(channel, now);
          return (
            <li key={channel.kind} className="px-5 py-4">
              <SourceChip kind={channel.kind} label={channel.kindLabel} />
              <p
                className={cn(
                  'mt-1.5 flex items-center gap-1.5 text-[16px] leading-6',
                  late
                    ? 'text-warning'
                    : channel.lastCaptureAt
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {late && <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" />}
                {channelState(channel, now)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// L'état d'un canal sans son nom, pour la bande : « il y a 2 h », « aucune depuis 12 j », « jamais ».
function channelState({ lastCaptureAt }: ChannelHealth, now: Date): string {
  if (!lastCaptureAt) return 'Aucune capture';
  const elapsed = now.getTime() - lastCaptureAt.getTime();
  if (elapsed <= DAY) return `Captée ${formatRelative(lastCaptureAt, now)}`;
  return `Aucune depuis ${Math.floor(elapsed / DAY)} j`;
}

function IndexingCell({ run }: { run: SourceRow['lastRun'] }) {
  const status = pipelineStatus(run);
  if (!run || !status) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Pas encore indexée</span>
      </>
    );
  }
  if (status !== 'failed') return <StatusBadge status={status} />;
  return (
    <details>
      <summary className="cursor-pointer list-none">
        <StatusBadge status="failed" />
      </summary>
      <p className="pt-1 text-[13px] leading-[18px] whitespace-normal text-destructive">
        {failureMessage()}
      </p>
    </details>
  );
}

export function SourcesTable({ sources }: { sources: SourceRow[] }) {
  const now = new Date();
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="text-[14px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="col"
              className="h-10 px-5 text-[12px] font-normal text-muted-foreground"
            >
              Origine
            </TableHead>
            <TableHead
              scope="col"
              className="h-10 px-5 text-[12px] font-normal text-muted-foreground"
            >
              Titre
            </TableHead>
            <TableHead
              scope="col"
              className="h-10 px-5 text-[12px] font-normal text-muted-foreground"
            >
              Dernier tour
            </TableHead>
            <TableHead
              scope="col"
              className="h-10 px-5 text-[12px] font-normal text-muted-foreground text-right"
            >
              Tours
            </TableHead>
            <TableHead
              scope="col"
              className="h-10 px-5 text-[12px] font-normal text-muted-foreground"
            >
              Indexation
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source.id} className="border-border/70 align-top transition-colors">
              <TableCell className="px-5 py-3">
                <SourceChip kind={source.kind} label={source.kindLabel} />
              </TableCell>
              <TableCell className="px-5 py-3 max-w-[40ch] whitespace-normal">
                {source.title ?? <span className="text-muted-foreground">Sans titre</span>}
                {source.url && (
                  <SourceLink
                    url={source.url}
                    label={source.kindLabel}
                    className="mt-0.5 flex w-fit text-[13px] leading-[18px]"
                  />
                )}
              </TableCell>
              <TableCell className="px-5 py-3 tabular-nums">
                {source.lastTurnAt ? (
                  <time
                    dateTime={source.lastTurnAt.toISOString()}
                    title={formatDateTime(source.lastTurnAt)}
                  >
                    {formatRelative(source.lastTurnAt, now)}
                  </time>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="px-5 py-3 text-right tabular-nums">
                {formatNumber(source.turnCount)}
              </TableCell>
              <TableCell className="px-5 py-3">
                <IndexingCell run={source.lastRun} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const sourcesHref = (page: number) => (page > 1 ? `/sources?page=${page}` : '/sources');

// Précédent et Suivant : le nombre total de sources n'est pas compté (il faudrait toutes les lire).
export function SourcesPagination({ page, hasNext }: { page: number; hasNext: boolean }) {
  if (page === 1 && !hasNext) return null;
  const link = cn(buttonVariants({ variant: 'outline' }), 'h-8 gap-1 rounded-md px-3 text-[14px]');
  return (
    <nav aria-label="Pages de sources" className="grid grid-cols-[1fr_auto_1fr] items-center">
      {page > 1 ? (
        <Link href={sourcesHref(page - 1)} rel="prev" className={cn(link, 'justify-self-start')}>
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          Précédent
        </Link>
      ) : null}
      <p className="col-start-2 text-[14px] text-muted-foreground tabular-nums">Page {page}</p>
      {hasNext ? (
        <Link
          href={sourcesHref(page + 1)}
          rel="next"
          className={cn(link, 'col-start-3 justify-self-end')}
        >
          Suivant
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
