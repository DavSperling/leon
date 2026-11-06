import { type SQL, sql } from 'drizzle-orm';
import { CAPTURE_KINDS, repoOf, type SourceKind, type TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import {
  epochToDate,
  LAST_TS_SQL,
  RESUME_LIKE,
  sourceInfoFrom,
  textArray,
} from '@/server/search/filters-sql';
import { myAddresses } from '@/server/search/people';
import type { SourceInfo } from '@/server/search/types';

// La matière du point du matin (T13), rassemblée par le code (D8 du plan du deuxième jet) : les sessions Claude Code
// de l'utilisateur sur le projet, ce qui a bougé dans le dépôt GitHub du projet depuis sa dernière session, et les
// passages qui le mentionnent. Tout se lit dans une seule transaction sous withTenant de l'utilisateur : la sécurité
// par ligne retire ce qu'il ne voit pas (la conversation privée d'un collègue sur le même dépôt), et rien ici
// n'ouvre d'autre accès à la base. Les filtres du point (clé du projet, dépôt, mention) ne s'écrivent pas avec ceux
// de la recherche (C4) : ces lectures sont donc les siennes, toujours sous les droits du lecteur.
//
// Écart assumé à la décision D4 du plan (« le point du matin n'a pas d'accès à la base hors de searchPassages,
// fetchPassageContext, fetchSource et listActivity ») : SearchFilters n'a de filtre ni sur `metadata.project` ni sur
// `origin.repo`, ni de recherche de mention par adresse. Ces trois lectures ne passent que par les tables sous
// sécurité par ligne (sources, turns, passages) et dans withTenant du lecteur. Quand les droits ou les exclusions
// changeront (T16 à T18), elles devront rester ainsi : rien de ce que la sécurité par ligne masque n'y entre, et
// toute nouvelle règle de visibilité qui ne serait pas portée par la sécurité par ligne devra y être ajoutée.
//
// Le texte capté est coupé ici, avant d'aller au modèle : les sessions sont longues (sorties d'outils), et le point
// se refait plusieurs fois par jour.

// Contraintes globales du plan : la matière des 14 derniers jours.
export const BRIEFING_DAYS = 14;
// Les dernières sessions lues sur le projet, et leurs derniers tours.
export const BRIEFING_SESSIONS = 3;
export const SESSION_TURNS_MAX = 24;
// Un tour (ou un passage) au-delà est coupé : de quoi comprendre une demande ou une réponse.
export const TURN_CHARS = 400;
// Les sources du dépôt qui ont bougé, et leurs derniers tours.
export const CHANGES_MAX = 10;
const CHANGE_TURNS = 2;
// Les passages qui mentionnent l'utilisateur (plan, T13).
export const MENTIONS_MAX = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
// Les outils lus par nom dans les requêtes : typés, pour qu'un nom qui n'est plus dans SOURCE_KINDS ne compile pas.
const CLAUDE_CODE = 'claude_code' satisfies SourceKind;
const GITHUB = 'github' satisfies SourceKind;

// Un extrait de la matière : un tour ou un passage, son texte déjà coupé.
export type BriefingExcerpt = {
  role: TurnRole;
  authorName: string | null;
  ts: Date;
  text: string;
};

// Une session Claude Code de l'utilisateur sur le projet, avec ses derniers tours.
export type BriefingSession = { source: SourceInfo; turns: BriefingExcerpt[] };
// Une source du dépôt du projet qui a bougé depuis la dernière session, avec ses derniers tours.
export type BriefingChange = { source: SourceInfo; turns: BriefingExcerpt[] };
// Un passage qui mentionne l'utilisateur, depuis sa dernière session.
export type BriefingMention = { source: SourceInfo; passageId: string; excerpt: BriefingExcerpt };

export type BriefingMaterial = {
  project: string;
  // Le début de la dernière session sur ce projet, au plus 14 jours avant : ce qui a bougé se compte depuis.
  since: Date;
  sessions: BriefingSession[];
  changes: BriefingChange[];
  mentions: BriefingMention[];
};

// Toutes les sources de la matière, une fois chacune, dans l'ordre où le prompt les numérote.
export function materialSourceIds(material: BriefingMaterial): string[] {
  const ids = [
    ...material.sessions.map((entry) => entry.source.sourceId),
    ...material.changes.map((entry) => entry.source.sourceId),
    ...material.mentions.map((entry) => entry.source.sourceId),
  ];
  return [...new Set(ids)];
}

export function isEmptyMaterial(material: BriefingMaterial): boolean {
  return (
    material.sessions.length === 0 &&
    material.changes.length === 0 &&
    material.mentions.length === 0
  );
}

// Coupe à TURN_CHARS unités UTF-16 sans séparer les deux moitiés d'un émoji, et le dit par « … ».
function cut(text: string): string {
  if (text.length <= TURN_CHARS) return text;
  const high = text.charCodeAt(TURN_CHARS - 1);
  const end = high >= 0xd800 && high <= 0xdbff ? TURN_CHARS - 1 : TURN_CHARS;
  return `${text.slice(0, end).trimEnd()}…`;
}

const uuids = (ids: readonly string[]): SQL => sql`${textArray(ids)}::uuid[]`;

type SourceRow = {
  id: string;
  kind: string;
  title: string | null;
  metadata: unknown;
  last_epoch: string;
};

type SessionRow = SourceRow & { first_epoch: string | null };

type TurnRow = {
  source_id: string;
  role: TurnRole;
  author_name: string | null;
  epoch: string;
  text: string;
};

type MentionRow = SourceRow & {
  passage_id: string;
  source_id: string;
  role: TurnRole;
  author_name: string | null;
  epoch: string;
  text: string;
};

export const sourceOf = (row: SourceRow): SourceInfo =>
  sourceInfoFrom({
    id: row.id,
    kind: row.kind,
    title: row.title,
    metadata: row.metadata,
    lastTs: epochToDate(row.last_epoch),
  });

const excerptOf = (
  row: Pick<TurnRow, 'role' | 'author_name' | 'epoch' | 'text'>,
): BriefingExcerpt => ({
  role: row.role,
  authorName: row.author_name,
  ts: epochToDate(row.epoch),
  text: cut(row.text),
});

// Les `limit` derniers tours de chacune de ces sources, dans l'ordre de la source. Le texte n'est lu qu'au début :
// une sortie d'outil de 20 000 caractères ne traverse pas la base pour en garder 400. Sans les résumés de Leon
// (T23) : le point du matin lit ce qui s'est passé, pas ce que le modèle en a dit.
export async function lastTurns(
  tx: Tx,
  ctx: TenantContext,
  sourceIds: string[],
  limit: number,
): Promise<Map<string, BriefingExcerpt[]>> {
  const bySource = new Map<string, BriefingExcerpt[]>();
  if (sourceIds.length === 0) return bySource;
  const { rows } = await tx.execute<TurnRow>(sql`
    select source_id, role, author_name, extract(epoch from ts) as epoch, text from (
      select t.source_id, t.role, t.author_name, t.ts, t.created_at, t.id,
             left(t.text, ${TURN_CHARS + 1}) as text,
             row_number() over (partition by t.source_id order by t.ts desc, t.created_at desc, t.id desc) as n
      from turns t
      where t.tenant_id = ${ctx.tenantId} and t.source_id = any(${uuids(sourceIds)})
        and t.external_id not like ${RESUME_LIKE}
    ) recent
    where n <= ${limit}
    order by source_id, ts, created_at, id`);
  for (const row of rows) {
    const list = bySource.get(row.source_id) ?? [];
    list.push(excerptOf(row));
    bySource.set(row.source_id, list);
  }
  return bySource;
}

// Les dernières sessions Claude Code du lecteur sur ce projet, actives depuis `cutoff`, la plus récente d'abord.
async function readSessions(tx: Tx, ctx: TenantContext, project: string, cutoff: Date) {
  const { rows } = await tx.execute<SessionRow>(sql`
    select s.id, s.kind, s.title, s.metadata, extract(epoch from l.last_ts) as last_epoch,
           extract(epoch from (select min(t.ts) from turns t
                               where t.tenant_id = s.tenant_id and t.source_id = s.id)) as first_epoch
    from sources s
    cross join lateral (select ${LAST_TS_SQL} as last_ts) l
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${CLAUDE_CODE}
      and s.metadata->>'project' = ${project}
      and l.last_ts >= ${cutoff.toISOString()}::timestamptz
    order by l.last_ts desc, s.id
    limit ${BRIEFING_SESSIONS}`);
  const turns = await lastTurns(
    tx,
    ctx,
    rows.map((row) => row.id),
    SESSION_TURNS_MAX,
  );
  const sessions = rows.map((row) => ({ source: sourceOf(row), turns: turns.get(row.id) ?? [] }));
  const start = rows[0]?.first_epoch;
  return { sessions, lastStart: start == null ? null : epochToDate(start) };
}

// Les sources GitHub du dépôt du projet qui ont bougé depuis `since`, la plus récente d'abord.
async function readChanges(tx: Tx, ctx: TenantContext, project: string, since: Date) {
  const repo = repoOf(project);
  if (repo === null) return [];
  const { rows } = await tx.execute<SourceRow>(sql`
    select s.id, s.kind, s.title, s.metadata, extract(epoch from l.last_ts) as last_epoch
    from sources s
    cross join lateral (select ${LAST_TS_SQL} as last_ts) l
    where s.tenant_id = ${ctx.tenantId} and s.kind = ${GITHUB}
      and lower(s.metadata->'origin'->>'repo') = ${repo}
      and l.last_ts >= ${since.toISOString()}::timestamptz
    order by l.last_ts desc, s.id
    limit ${CHANGES_MAX}`);
  const turns = await lastTurns(
    tx,
    ctx,
    rows.map((row) => row.id),
    CHANGE_TURNS,
  );
  return rows.map((row) => ({ source: sourceOf(row), turns: turns.get(row.id) ?? [] }));
}

// L'expression régulière (Postgres) qui trouve `text` tel quel, sans caractère d'adresse ou d'identifiant collé avant
// ni après.
export function wholeWord(text: string): string {
  const literal = text.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
  return `(?<![[:alnum:]._%+-])${literal}(?![[:alnum:]_-])`;
}

// Les passages qui mentionnent le lecteur depuis `since` : son adresse e-mail dans le texte, ou son identifiant
// d'outil précédé de « @ » dans un élément de cet outil (T19). Ni ce qu'il a écrit lui-même, ni ses propres
// conversations, ni une source déjà comptée parmi les changements. Sans adresse connue : rien (on ne devine pas).
async function readMentions(
  tx: Tx,
  ctx: TenantContext,
  me: Awaited<ReturnType<typeof myAddresses>>,
  since: Date,
  excluded: string[],
): Promise<BriefingMention[]> {
  const emails = me.emails.map((email) => email.toLowerCase()).filter((email) => email !== '');
  const names = me.names.filter((name) => name.name.trim() !== '');
  // Un mot entier, pas un morceau : « bob@acme.fr » n'est pas mentionné par « jacob@acme.fr », ni « @al » par « @alice »
  // (le texte d'un tiers qui ne le concerne pas entrerait sinon dans son point).
  const mentions: SQL[] = [
    ...emails.map((email) => sql`lower(p.text) ~ ${wholeWord(email)}`),
    ...names.map(
      (name) =>
        sql`(s.kind = ${name.kind} and lower(p.text) ~ ${wholeWord(`@${name.name.toLowerCase()}`)})`,
    ),
  ];
  if (mentions.length === 0) return [];
  const mine: SQL[] = [
    ...(emails.length > 0 ? [sql`lower(p.author_email) = any(${textArray(emails)})`] : []),
    ...names.map(
      (name) => sql`(s.kind = ${name.kind} and lower(p.author_name) = ${name.name.toLowerCase()})`,
    ),
  ];
  const { rows } = await tx.execute<MentionRow>(sql`
    select m.passage_id, m.source_id, t.role, m.author_name, extract(epoch from m.ts) as epoch, m.text,
           s.id, s.kind, s.title, s.metadata, extract(epoch from ${LAST_TS_SQL}) as last_epoch
    from (
      select p.id as passage_id, p.tenant_id, p.source_id, p.turn_id, p.author_name, p.ts,
             left(p.text, ${TURN_CHARS + 1}) as text
      from passages p
      join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
      where p.tenant_id = ${ctx.tenantId} and p.ts >= ${since.toISOString()}::timestamptz
        and not (s.owner_user_id = ${ctx.userId} and s.kind = any(${textArray(CAPTURE_KINDS)}))
        and not (s.id = any(${uuids(excluded)}))
        and (${sql.join(mentions, sql` or `)})
        and not coalesce(${sql.join(mine, sql` or `)}, false)
      order by p.ts desc, p.id
      limit ${MENTIONS_MAX}
    ) m
    join sources s on s.tenant_id = m.tenant_id and s.id = m.source_id
    join turns t on t.tenant_id = m.tenant_id and t.id = m.turn_id
    order by m.ts desc, m.passage_id`);
  return rows.map((row) => ({
    source: sourceOf(row),
    passageId: row.passage_id,
    excerpt: excerptOf(row),
  }));
}

export async function gatherBriefingMaterial(
  ctx: TenantContext,
  project: string,
  now: Date,
): Promise<BriefingMaterial> {
  const cutoff = new Date(now.getTime() - BRIEFING_DAYS * DAY_MS);
  const me = await myAddresses(ctx);
  return withTenant(ctx, async (tx) => {
    const { sessions, lastStart } = await readSessions(tx, ctx, project, cutoff);
    const since = lastStart !== null && lastStart > cutoff ? lastStart : cutoff;
    const changes = await readChanges(tx, ctx, project, since);
    const mentions = await readMentions(
      tx,
      ctx,
      me,
      since,
      changes.map((entry) => entry.source.sourceId),
    );
    return { project, since, sessions, changes, mentions };
  });
}
