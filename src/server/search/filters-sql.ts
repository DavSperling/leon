import { type SQL, sql } from 'drizzle-orm';
import { ITEM_NATURES, type ItemNature, type SourceKind } from '@/capture/turn';
import { safeUrl } from '@/lib/safe-url';
import type { SearchFilters, SourceInfo } from './types';

// Les morceaux de SQL et de lecture que partagent la recherche, le contexte et l'activité. Les requêtes les
// assemblent sous ces noms d'alias : `p` pour passages, `s` pour sources, `t` pour turns. Tout ce qui vient
// de l'utilisateur passe en paramètre, jamais dans le texte de la requête.

// Un tableau de textes en paramètres : drizzle écrit un tableau JavaScript « ($1, $2) », qui n'est pas un
// tableau SQL.
export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  const items = values.map((value) => sql`${value}`);
  return sql`array[${sql.join(items, sql`, `)}]::text[]`;
}

function allOf(conditions: SQL[]): SQL {
  if (conditions.length === 0) return sql`true`;
  return sql.join(
    conditions.map((condition) => sql`(${condition})`),
    sql` and `,
  );
}

// Sans nature écrite, ou avec une nature que le code ne connaît pas : une conversation (la nature d'une source
// de capture n'est écrite nulle part ; celle d'un connecteur est dans `metadata`, voir ingest-items.ts).
export const NATURE_SQL = sql`(case when s.metadata->>'nature' = any(${textArray(ITEM_NATURES)})
  then s.metadata->>'nature' else 'conversation' end)`;

// Dernière activité de la source : la date du dernier tour que l'ingestion a notée, à défaut celle du plus
// récent des tours, à défaut celle de la création de la source.
export const LAST_TS_SQL = sql`coalesce(s.last_turn_at,
  (select max(t.ts) from turns t where t.tenant_id = s.tenant_id and t.source_id = s.id), s.created_at)`;

function validDate(date: Date | undefined): Date | null {
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// Les conditions sur la source (alias `s`) : l'outil et la nature.
export function sourceConditions(filters: SearchFilters): SQL {
  const conditions: SQL[] = [];
  if (filters.tools?.length) conditions.push(sql`s.kind = any(${textArray(filters.tools)})`);
  if (filters.natures?.length) {
    conditions.push(sql`${NATURE_SQL} = any(${textArray(filters.natures)})`);
  }
  return allOf(conditions);
}

// Les conditions sur le passage (alias `p`) : les dates et l'auteur. `kind` est l'expression SQL de l'outil de
// sa source, pour les noms d'auteur qui ne valent que dans un outil.
// Les auteurs s'additionnent : un passage d'une adresse ou d'un nom listés convient.
export function passageConditions(filters: SearchFilters, kind: SQL): SQL {
  const conditions: SQL[] = [];
  const since = validDate(filters.since);
  const until = validDate(filters.until);
  if (since) conditions.push(sql`p.ts >= ${since.toISOString()}::timestamptz`);
  if (until) conditions.push(sql`p.ts < ${until.toISOString()}::timestamptz`);
  const emails = (filters.authorEmails ?? []).map((email) => email.toLowerCase());
  const names = filters.authorNames ?? [];
  const authors: SQL[] = [];
  if (emails.length > 0) authors.push(sql`lower(p.author_email) = any(${textArray(emails)})`);
  for (const author of names) {
    authors.push(
      sql`(${kind} = ${author.kind} and lower(p.author_name) = ${author.name.toLowerCase()})`,
    );
  }
  if (authors.length > 0) conditions.push(sql`(${sql.join(authors, sql` or `)})`);
  return allOf(conditions);
}

// Une date lue en secondes depuis 1970 (`extract(epoch from …)`) : drizzle rend les dates de ses requêtes SQL
// brutes en texte, que seul `extract` donne sans ambiguïté.
export function epochToDate(epoch: string | number): Date {
  return new Date(Math.round(Number(epoch) * 1000));
}

const NATURES = new Set<string>(ITEM_NATURES);

const ORIGIN_KEYS_MAX = 20;
// Ce qu'une valeur d'origine garde à la lecture ; un connecteur coupe la sienne d'avance (github/map.ts).
export const ORIGIN_VALUE_MAX = 300;

function origin(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .slice(0, ORIGIN_KEYS_MAX)
    .map(([key, text]) => [key, text.slice(0, ORIGIN_VALUE_MAX)] as const);
  return Object.fromEntries(entries);
}

// Ce que la recherche et le contexte disent d'une source, à partir de sa ligne : la nature, le lien et l'origine
// viennent de `metadata`, qu'un connecteur remplit et qu'on ne croit pas sur parole.
export function sourceInfoFrom(row: {
  id: string;
  kind: string;
  title: string | null;
  metadata: unknown;
  lastTs: Date;
}): SourceInfo {
  const metadata =
    typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : {};
  const nature =
    typeof metadata.nature === 'string' && NATURES.has(metadata.nature)
      ? (metadata.nature as ItemNature)
      : 'conversation';
  return {
    sourceId: row.id,
    kind: row.kind as SourceKind,
    nature,
    title: row.title,
    url: safeUrl(metadata.url),
    origin: origin(metadata.origin),
    lastTs: row.lastTs,
  };
}
