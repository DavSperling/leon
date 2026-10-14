import { count, eq, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { reviewItems } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { isoDate, oneLine } from './labels';
import { DATA_GUARD_LINE } from './render-card';

// Briefing déterministe (C11) : fiches touchées sur 7 jours, une ligne chacune, sous la RLS du lecteur.

export const BRIEFING_MAX_CHARS = 3_000;
const WINDOW_DAYS = 7;
const STATEMENT_MAX = 140;

export type BriefingEntry = {
  cardId: string;
  title: string;
  typeLabel: string;
  lastFactAt: Date;
  latestStatement: string;
  hasConflict: boolean;
};
export type Briefing = { markdown: string; entries: BriefingEntry[]; reviewCount: number };

function truncate(text: string): string {
  return text.length <= STATEMENT_MAX ? text : `${text.slice(0, STATEMENT_MAX - 1)}…`;
}

function entryLine(entry: BriefingEntry): string {
  const flag = entry.hasConflict ? ' · contradiction à vérifier' : '';
  const head = `${oneLine(entry.title)} (${oneLine(entry.typeLabel)}) · ${isoDate(entry.lastFactAt)}`;
  return `- ${head} : ${truncate(oneLine(entry.latestStatement))}${flag}`;
}

const reviewLine = (count: number) =>
  `${count} ${count > 1 ? 'éléments' : 'élément'} à vérifier dans Leon.`;
const omittedLine = (count: number) => `… ${count} autres fiches`;

export function formatBriefing(entries: BriefingEntry[], reviewCount: number): string {
  return composeBriefing(entries, reviewCount).markdown;
}

// Pure : le markdown (format de C11) et, dans `entries`, les seules fiches qu'il montre.
export function composeBriefing(entries: BriefingEntry[], reviewCount: number): Briefing {
  const head = ['# Briefing Leon · 7 derniers jours', DATA_GUARD_LINE];
  const tail = reviewLine(reviewCount);
  if (entries.length === 0) {
    const markdown = [...head, 'Aucune fiche modifiée ces 7 derniers jours.', tail].join('\n');
    return { markdown, entries, reviewCount };
  }
  // On s'arrête avant la ligne qui ferait dépasser, mention des fiches omises comprise.
  const lines: string[] = [];
  let length = [...head, tail].join('\n').length;
  for (const [index, entry] of entries.entries()) {
    const line = entryLine(entry);
    const reserved = omittedLine(entries.length - index - 1).length + 1;
    const isLast = index === entries.length - 1;
    if (length + line.length + 1 + (isLast ? 0 : reserved) > BRIEFING_MAX_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  const omitted = entries.length - lines.length;
  const body = omitted > 0 ? [...lines, omittedLine(omitted)] : lines;
  return {
    markdown: [...head, ...body, tail].join('\n'),
    entries: entries.slice(0, lines.length),
    reviewCount,
  };
}

type Row = {
  card_id: string;
  title: string;
  type_label: string;
  last_fact_at: Date | string;
  latest_statement: string;
  has_conflict: boolean;
};

// Fiches non fusionnées ayant un fait visible enregistré depuis `since`, la plus récente en haut.
// Le dernier fait et le drapeau « contradiction » se calculent sur les faits que voit le lecteur (D8).
async function recentEntries(tx: Tx, since: Date): Promise<BriefingEntry[]> {
  const { rows } = await tx.execute<Row>(sql`
    select c.id as card_id, c.title, t.label as type_label,
      latest.recorded_at as last_fact_at, latest.statement as latest_statement,
      exists (select 1 from facts cf where cf.card_id = c.id and cf.status = 'conflict') as has_conflict
    from cards c
    join card_types t on t.id = c.type_id
    join lateral (
      select f.statement, f.recorded_at from facts f
      where f.card_id = c.id and f.recorded_at >= ${since}
      order by f.recorded_at desc, f.id limit 1
    ) latest on true
    where c.merged_into is null
    order by latest.recorded_at desc, c.id`);
  return rows.map((row) => ({
    cardId: row.card_id,
    title: row.title,
    typeLabel: row.type_label,
    lastFactAt: new Date(row.last_fact_at),
    latestStatement: row.latest_statement,
    hasConflict: row.has_conflict,
  }));
}

async function countOpenReviews(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ open: count() })
    .from(reviewItems)
    .where(eq(reviewItems.status, 'open'));
  return row?.open ?? 0;
}

export async function buildBriefing(ctx: TenantContext, now: Date = new Date()): Promise<Briefing> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
  const { entries, reviewCount } = await withTenant(ctx, async (tx) => ({
    entries: await recentEntries(tx, since),
    reviewCount: await countOpenReviews(tx),
  }));
  return composeBriefing(entries, reviewCount);
}
