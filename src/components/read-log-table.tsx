import Link from 'next/link';
import { SourceChip, type SourceChipKind } from '@/components/source-chip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import type { ReadLogEntry } from '@/server/memory/read-log';

const CHIP_KINDS: Record<string, SourceChipKind> = {
  'claude-code': 'claude_code',
  interface: 'interface',
};

export function ReadLogTable({ entries }: { entries: ReadLogEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead scope="col">Quand</TableHead>
          <TableHead scope="col">Qui</TableHead>
          <TableHead scope="col">Avec</TableHead>
          <TableHead scope="col">Fiche</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} className="h-9">
            <TableCell className="tabular-nums">
              <time dateTime={entry.at.toISOString()}>{formatDateTime(entry.at)}</time>
            </TableCell>
            <TableCell>{entry.readerName}</TableCell>
            <TableCell>
              <SourceChip kind={CHIP_KINDS[entry.client] ?? 'other'} label={entry.clientLabel} />
            </TableCell>
            <TableCell>
              <Link href={`/fiches/${entry.cardId}`} className="text-primary hover:underline">
                {entry.cardTitle}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
