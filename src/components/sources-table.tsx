import { TriangleAlert } from 'lucide-react';
import { SourceChip } from '@/components/source-chip';
import { type BadgeStatus, StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import type { ChannelHealth, SourceRow } from '@/server/memory/sources';

const DAY = 24 * 60 * 60 * 1000;
const STEP_LABELS: Record<NonNullable<SourceRow['lastRun']>['step'], string> = {
  triage: 'Tri',
  extraction: 'Extraction',
  placement: 'Rangement',
  done: 'Traitement',
};

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

export function pipelineStatus(run: SourceRow['lastRun']): BadgeStatus | null {
  if (!run) return null;
  return run.status === 'queued' || run.status === 'running' ? 'running' : run.status;
}

// Message fixe : le message technique de l'erreur n'est jamais montré.
export function failureMessage(step: NonNullable<SourceRow['lastRun']>['step']): string {
  return `Échec à l'étape ${STEP_LABELS[step]}.`;
}

export function ChannelLines({ channels }: { channels: ChannelHealth[] }) {
  const now = new Date();
  return (
    <ul className="space-y-1 text-[13px] leading-[18px]">
      {channels.map((channel) => {
        const { text, late } = channelLine(channel, now);
        return (
          <li
            key={channel.kind}
            className={late ? 'flex items-center gap-1.5 text-warning' : 'text-foreground-2'}
          >
            {late && <TriangleAlert size={16} strokeWidth={1.5} aria-hidden="true" />}
            {text}
          </li>
        );
      })}
    </ul>
  );
}

function PipelineCell({ run }: { run: SourceRow['lastRun'] }) {
  const status = pipelineStatus(run);
  if (!run || !status) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Aucun traitement</span>
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
        {failureMessage(run.step)}
      </p>
    </details>
  );
}

export function SourcesTable({ sources }: { sources: SourceRow[] }) {
  const now = new Date();
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead scope="col">Origine</TableHead>
          <TableHead scope="col">Conversation</TableHead>
          <TableHead scope="col">Dernier tour</TableHead>
          <TableHead scope="col" className="text-right">
            Tours
          </TableHead>
          <TableHead scope="col">Pipeline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.id} className="h-9 align-top">
            <TableCell>
              <SourceChip kind={source.kind} label={source.kindLabel} />
            </TableCell>
            <TableCell className="max-w-[40ch] whitespace-normal">
              {source.title ?? <span className="text-muted-foreground">Sans titre</span>}
            </TableCell>
            <TableCell className="tabular-nums">
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
            <TableCell className="text-right tabular-nums">
              {formatNumber(source.turnCount)}
            </TableCell>
            <TableCell>
              <PipelineCell run={source.lastRun} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
