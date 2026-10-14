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
    <div className="overflow-hidden rounded-xl border">
      <Table className="text-[15px]">
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead scope="col" className="h-11 px-5 text-[15px] font-medium">
              Quand
            </TableHead>
            <TableHead scope="col" className="h-11 px-5 text-[15px] font-medium">
              Qui
            </TableHead>
            <TableHead scope="col" className="h-11 px-5 text-[15px] font-medium">
              Avec
            </TableHead>
            <TableHead scope="col" className="h-11 px-5 text-[15px] font-medium">
              Fiche
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id} className="transition-colors">
              <TableCell className="px-5 py-3 tabular-nums">
                <time dateTime={entry.at.toISOString()}>{formatDateTime(entry.at)}</time>
              </TableCell>
              <TableCell className="px-5 py-3">{entry.readerName}</TableCell>
              <TableCell className="px-5 py-3">
                <SourceChip kind={CHIP_KINDS[entry.client] ?? 'other'} label={entry.clientLabel} />
              </TableCell>
              <TableCell className="px-5 py-3">
                <Link
                  href={`/fiches/${entry.cardId}`}
                  className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
                >
                  {entry.cardTitle}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
