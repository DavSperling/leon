import { and, asc, eq, sql } from 'drizzle-orm';
import { PROVIDER_IDS, repoOf } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { projectOfSource } from '@/server/briefing/queue';
import { db } from '@/server/db/client';
import { members } from '@/server/db/schema/auth';
import { sources, turns } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { Embedder } from '@/server/embeddings/embedder';
import { logError, safeErrorSummary } from '@/server/log';
import { lockTarget } from '@/server/memory/versions';
import { textArray } from '@/server/search/filters-sql';
import {
  boundMots,
  FIL,
  type Fil,
  keyOf,
  listOf,
  lockAuthor,
  nearestFil,
  TICKETS_MAX,
  union,
  writeLists,
} from './threads';
import {
  enqueueFilMaj,
  getThreadsBoss,
  LIAISON_QUEUE,
  LINKED_KINDS,
  type ThreadJob,
  ThreadJobSchema,
} from './threads-queue';

// Relier les sources aux fils de travail (T42 ; D21, D22, D34 et D35 du plan de la mémoire à disposition), sans
// modèle. Une source qu'un fil peut relier (LINKED_KINDS) l'est aux fils de chaque membre qui la voit, sous ses droits
// (withTenant), une transaction par membre :
// - un outil (connecteur ou GitHub) d'abord par clé exacte (cleOf) : une PR par son numéro ou par sa branche (jamais
//   celle d'un fork), un ticket par l'identifiant (ABC-123) qui ouvre son titre, cité par une branche du fil ou par le
//   titre, le corps ou la branche d'une PR reliée, et un message qui cite l'URL d'une PR ou une branche du fil ;
// - sinon, et toujours pour une note, un document ou une conversation web, par proximité (nearestFil) : le fil le plus
//   proche, sur le projet de la source quand elle en a un, à 30 jours au plus, sous le seuil ;
// - profondeur 2 au plus (D22) : une PR reliée fait relier les tickets qu'elle cite, et rien plus loin.
// Un fil qui change (le rangement, T40) est relié de l'autre côté : les PR et les tickets visibles de ses clés.
// `liees` ne garde que l'id et ce qui relie (`cle`), `mots_cles` les mots du titre d'un outil (D21) : jamais le texte
// d'un tour. Une source devenue invisible reste dans `liees`, les lectures font la jointure sous RLS (D35) ; une source
// retirée de son outil en sort (unlinkSources). Un fil qui change est mis en file `fil-maj` (T43) : la liaison n'écrit
// jamais l'état. Les verrous sont ceux du rangement : l'auteur (lockAuthor), puis chaque fil par lockTarget. Les
// journaux ne citent que des uuid.

const LIAISON_CONCURRENCY = 2;
const TOOLS: ReadonlySet<string> = new Set(PROVIDER_IDS);
// Un identifiant de ticket (Linear, Jira…) cité dans un texte, et celui qui ouvre le titre d'un ticket.
const TICKET = /\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/g;
const LEADING_TICKET = /^([A-Z][A-Z0-9]{1,9}-\d{1,7})(?:\D|$)/;
const LEADING_TICKET_SQL = '^([A-Z][A-Z0-9]{1,9}-[0-9]{1,7})([^0-9]|$)';
const PR_ID = /^pr:([^#]+)#(\d+)$/i;
const PR_URL = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/gi;
const MOTS_MAX = 200;
// Les outils que les clés d'un fil font relire, au plus.
const KEY_SOURCES_MAX = 100;

type Cle = 'pr' | 'branche' | 'ticket' | 'lien' | 'proximite';
type Pr = { repo: string; numero: number };
type Source = {
  id: string;
  kind: string;
  externalId: string;
  title: string | null;
  metadata: Record<string, unknown>;
  // Les tours `document` (le corps d'une PR), puis tous les tours, d'un outil seulement.
  documents: string[];
  texts: string;
};
type Keys = {
  id: string;
  project: string | null;
  branches: string[];
  prs: Pr[];
  tickets: string[];
};

const ticketsIn = (text: string): string[] => text.match(TICKET) ?? [];
const samePr = (a: Pr) => (b: Pr) => a.repo === b.repo && a.numero === b.numero;
const citedPrs = (text: string): Pr[] =>
  [...text.matchAll(PR_URL)].map((match) => ({
    repo: (match[1] as string).toLowerCase(),
    numero: Number(match[2]),
  }));
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Une branche citée telle quelle, pas un morceau d'une autre (paul/fils n'est pas dans paul/fils-2).
// shortcut: seulement une branche à séparateur (/, - ou _) : « dev » ou « test » se lisent dans n'importe quel message ;
// revoir si une équipe nomme ses branches d'un seul mot.
const cites = (text: string, branch: string) =>
  /[/_-]/.test(branch) && new RegExp(`(^|[^\\w./-])${escapeRegExp(branch)}($|[^\\w/-])`).test(text);
// Les mots d'un titre d'outil, sans ponctuation, MOTS_MAX caractères au plus (D21).
const motsOf = (title: string | null) =>
  (title?.match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? []).join(' ').slice(0, MOTS_MAX);

function prOf(source: Source): Pr | null {
  const match = source.kind === 'github' ? PR_ID.exec(source.externalId) : null;
  return match ? { repo: (match[1] as string).toLowerCase(), numero: Number(match[2]) } : null;
}

// La branche d'une PR de l'équipe dont la tête est dans son dépôt : celle d'un fork peut porter n'importe quel nom
// (comme start-context.ts).
function branchOf(source: Source, pr: Pr): string | null {
  const { branche, tete, cote } = (source.metadata.origin ?? {}) as Record<string, unknown>;
  return typeof branche === 'string' &&
    cote === 'equipe' &&
    typeof tete === 'string' &&
    tete.toLowerCase() === pr.repo
    ? branche
    : null;
}

// Les tickets qu'une PR cite : dans sa branche (en majuscules, comme `abc-123-…`), son titre et son corps (D22).
function ticketsOfPr(source: Source, pr: Pr): string[] {
  const branch = branchOf(source, pr) ?? '';
  return [
    ...new Set([
      ...ticketsIn(branch.toUpperCase()),
      ...ticketsIn(source.title ?? ''),
      ...source.documents.flatMap(ticketsIn),
    ]),
  ];
}

// Ce qui relie un outil à ce fil par clé exacte (D22), ou null.
function cleOf(source: Source, fil: Keys): Cle | null {
  const pr = prOf(source);
  if (pr && fil.prs.some(samePr(pr))) return 'pr';
  const repo = fil.project === null ? null : repoOf(fil.project);
  const branch = pr && pr.repo === repo ? branchOf(source, pr) : null;
  if (branch !== null && fil.branches.includes(branch)) return 'branche';
  const ticket = LEADING_TICKET.exec(source.title ?? '')?.[1];
  if (ticket && fil.tickets.includes(ticket)) return 'ticket';
  const cited = citedPrs(source.texts);
  if (cited.some((one) => fil.prs.some(samePr(one)))) return 'lien';
  if (fil.branches.some((one) => cites(source.texts, one))) return 'lien';
  return null;
}

// Les clés d'un fil, avec les tickets de ses branches.
function keysOf(fil: Fil): Keys {
  const { project } = fil.metadata;
  const branches = listOf(fil, 'branches').filter((one) => typeof one === 'string');
  return {
    id: fil.id,
    project: typeof project === 'string' ? project : null,
    branches,
    prs: listOf(fil, 'prs') as Pr[],
    tickets: union(
      listOf(fil, 'tickets'),
      branches.flatMap((one) => ticketsIn(one.toUpperCase())),
    ) as string[],
  };
}

async function readFil(tx: Tx, ctx: TenantContext, id: string): Promise<Fil | null> {
  const [row] = await tx
    .select({ metadata: sources.metadata })
    .from(sources)
    .where(and(eq(sources.tenantId, ctx.tenantId), eq(sources.id, id)));
  return row ? { id, metadata: row.metadata } : null;
}

// La source, si l'auteur la voit (RLS) et qu'un fil peut la relier.
async function readSource(tx: Tx, ctx: TenantContext, sourceId: string): Promise<Source | null> {
  const [row] = await tx
    .select({
      id: sources.id,
      kind: sources.kind,
      externalId: sources.externalId,
      title: sources.title,
      metadata: sources.metadata,
    })
    .from(sources)
    .where(and(eq(sources.tenantId, ctx.tenantId), eq(sources.id, sourceId)));
  if (!row || !LINKED_KINDS.has(row.kind)) return null;
  // Les clés exactes ne valent que pour un outil : seuls ses tours sont lus.
  const rows = TOOLS.has(row.kind)
    ? await tx
        .select({ role: turns.role, text: turns.text })
        .from(turns)
        .where(and(eq(turns.tenantId, ctx.tenantId), eq(turns.sourceId, sourceId)))
    : [];
  return {
    ...row,
    documents: rows.filter((turn) => turn.role === 'document').map((turn) => turn.text),
    texts: rows.map((turn) => turn.text).join('\n'),
  };
}

// Les clés des fils de l'auteur, hors absorbés, dans l'ordre des ids (D34).
async function readFils(tx: Tx, ctx: TenantContext): Promise<Keys[]> {
  const { rows } = await tx.execute<{ id: string; metadata: Record<string, unknown> }>(sql`
    select s.id, jsonb_build_object('project', s.metadata->'project', 'branches', s.metadata->'branches',
      'prs', s.metadata->'prs', 'tickets', s.metadata->'tickets') as metadata
    from sources s
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
      and s.metadata->>'absorbe_par' is null
    order by s.id`);
  return rows.map(keysOf);
}

// Les outils visibles de l'auteur que ces clés d'un fil relient : une PR par son numéro ou par sa branche, un ticket par
// l'identifiant qui ouvre son titre. cleOf décide ensuite, comme pour une source indexée.
// shortcut: un message qui cite une PR ou une branche n'est relié qu'à son indexation, pas quand un fil prend cette clé
// plus tard (il faudrait relire tous les tours) ; une source proche non plus, quand un fil reçoit plus tard un résumé.
// Les relire par le tic des vecteurs le jour où ça se voit.
async function keySources(
  tx: Tx,
  ctx: TenantContext,
  keys: { prs: Pr[]; branches: string[]; repo: string | null; tickets: string[] },
): Promise<string[]> {
  const prIds = keys.prs.map((pr) => `pr:${pr.repo}#${pr.numero}`);
  const { rows } = await tx.execute<{ id: string }>(sql`
    select s.id from sources s
    where s.tenant_id = ${ctx.tenantId} and s.kind = any(${textArray(PROVIDER_IDS)}) and (
      (s.kind = 'github' and lower(s.external_id) = any(${textArray(prIds)}))
      or (s.kind = 'github' and s.external_id like 'pr:%'
        and lower(s.metadata->'origin'->>'tete') = ${keys.repo}
        and s.metadata->'origin'->>'branche' = any(${textArray(keys.branches)}))
      or substring(s.title from ${LEADING_TICKET_SQL}) = any(${textArray(keys.tickets)}))
    order by s.id
    limit ${KEY_SOURCES_MAX}`);
  return rows.map((row) => row.id);
}

// Relie la source à ce fil, sous son verrou : relu, rien de ce que le rangement y a écrit n'est perdu. Rend les tickets
// ajoutés au fil, ou null si rien n'a changé.
async function attach(
  tx: Tx,
  ctx: TenantContext,
  filId: string,
  source: Source,
  cle: Cle,
  tickets: string[],
): Promise<string[] | null> {
  if (!(await lockTarget(tx, ctx, filId))) return null;
  const fil = await readFil(tx, ctx, filId);
  if (!fil || fil.metadata.absorbe_par !== undefined) return null;
  const known = listOf(fil, 'tickets');
  const added = tickets.filter((ticket) => !known.includes(ticket));
  // Seul le titre d'un outil donne des mots : celui d'une note est le début de son texte (remember-tool.ts).
  const mots = TOOLS.has(source.kind) ? motsOf(source.title) : '';
  const changed = await writeLists(tx, filId, {
    liees: union(listOf(fil, 'liees'), [{ id: source.id, cle }]),
    mots_cles: boundMots(
      union(listOf(fil, 'mots_cles'), mots === '' ? [] : [{ id: source.id, mots }]),
    ),
    tickets: union(known, added).slice(-TICKETS_MAX),
  });
  return changed ? added : null;
}

// Relie une source aux fils de l'auteur ; depuis une PR reliée par clé, les tickets qu'elle cite (profondeur 2, D22).
async function linkOne(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
  model: string | null,
  depth: 1 | 2,
  changed: Set<string>,
): Promise<void> {
  const source = await readSource(tx, ctx, sourceId);
  if (!source) return;
  let matches: Array<{ id: string; cle: Cle }> = TOOLS.has(source.kind)
    ? (await readFils(tx, ctx)).flatMap((fil) => {
        const cle = cleOf(source, fil);
        return cle ? [{ id: fil.id, cle }] : [];
      })
    : [];
  if (matches.length === 0 && model !== null) {
    const project = projectOfSource({ ...source, ownerUserId: ctx.userId })?.project ?? null;
    const nearest = await nearestFil(tx, ctx, source.id, project, model, false);
    if (nearest !== null) matches = [{ id: nearest, cle: 'proximite' }];
  }
  const pr = prOf(source);
  for (const { id, cle } of matches) {
    const tickets = pr && cle !== 'proximite' ? ticketsOfPr(source, pr) : [];
    const added = await attach(tx, ctx, id, source, cle, tickets);
    if (added === null) continue;
    changed.add(id);
    if (depth === 2 || added.length === 0) continue;
    const found = await keySources(tx, ctx, { prs: [], branches: [], repo: null, tickets: added });
    for (const ticket of found) await linkOne(tx, ctx, ticket, null, 2, changed);
  }
}

// Un fil qui change (le rangement) : les tickets de ses branches, puis les outils que ses clés relient.
async function linkFil(
  tx: Tx,
  ctx: TenantContext,
  filId: string,
  changed: Set<string>,
): Promise<void> {
  if (!(await lockTarget(tx, ctx, filId))) return;
  const fil = await readFil(tx, ctx, filId);
  if (!fil || fil.metadata.absorbe_par !== undefined) return;
  const keys = keysOf(fil);
  if (await writeLists(tx, filId, { tickets: keys.tickets.slice(-TICKETS_MAX) })) {
    changed.add(filId);
  }
  const repo = keys.project === null ? null : repoOf(keys.project);
  for (const id of await keySources(tx, ctx, { ...keys, repo })) {
    await linkOne(tx, ctx, id, null, 1, changed);
  }
}

// Les membres de l'organisation (`member` n'a pas de sécurité par ligne : des ids seulement).
async function memberIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.organizationId, tenantId))
    .orderBy(asc(members.userId));
  return rows.map((row) => row.userId);
}

// Après la validation, pour que la mise à jour lise le fil relié. Une file indisponible ne défait pas la liaison : le
// prochain changement du fil le remet en file.
async function queueFilMaj(ctx: TenantContext, filId: string): Promise<void> {
  try {
    await enqueueFilMaj({ tenantId: ctx.tenantId, sourceId: filId, ownerUserId: ctx.userId });
  } catch (error) {
    logError('thread_links.fil_maj_enqueue', error, { tenantId: ctx.tenantId, sourceId: filId });
  }
}

// Relie la source ou le fil du job (D22), et met en file `fil-maj` chaque fil changé, qu'elle rend. Un fil se relie
// pour son auteur ; une source, pour chaque membre de l'organisation qui la voit. Idempotent : relancée, elle ne change
// rien. Sans fournisseur de vecteurs, rien n'est relié par proximité.
// shortcut: chaque membre est relu, même sans aucun fil ; lister les auteurs de fils par une fonction (comme
// briefings_du_projet) quand une organisation dépasse quelques dizaines de membres.
export async function linkSource(
  job: ThreadJob,
  deps: { embedder: Embedder | null },
): Promise<string[]> {
  const model = deps.embedder?.model ?? null;
  // Celui qui l'a indexée, ou l'auteur du fil : un ancien membre a pu laisser une source à l'équipe.
  const indexer = await resolveTenantContext(job.ownerUserId, job.tenantId, {
    includeFormer: true,
  });
  if (!indexer) return [];
  const [source] = await withTenant(indexer, (tx) =>
    tx
      .select({ kind: sources.kind })
      .from(sources)
      .where(and(eq(sources.tenantId, job.tenantId), eq(sources.id, job.sourceId))),
  );
  if (!source) return [];
  const isFil = source.kind === FIL;
  const changed: string[] = [];
  for (const userId of isFil ? [job.ownerUserId] : await memberIds(job.tenantId)) {
    const ctx = await resolveTenantContext(userId, job.tenantId);
    if (!ctx) continue;
    const fils = await withTenant(ctx, async (tx) => {
      const set = new Set<string>();
      if (!(await lockAuthor(tx, ctx))) return set;
      if (isFil) await linkFil(tx, ctx, job.sourceId, set);
      else await linkOne(tx, ctx, job.sourceId, model, 1, set);
      return set;
    });
    for (const fil of fils) {
      await queueFilMaj(ctx, fil);
      changed.push(fil);
    }
  }
  return changed;
}

// Des sources retirées de leur outil (removeConnectorItems) quittent les fils qui les relient, et ces fils sont mis en
// file `fil-maj` (D22) : une version dont une entrée a disparu ne se lit déjà plus (D33). Les sources sont parties : un
// échec est journalisé, il ne les fait pas revenir.
// shortcut: seul le retrait d'un connecteur est suivi ; un document supprimé (supprimer_document) reste dans `liees`,
// invisible de toute lecture (D35), jusqu'à ce que sa suppression appelle aussi cette fonction.
export async function unlinkSources(tenantId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  const kept = (list: unknown[]) => list.filter((item) => !gone.has(keyOf(item)));
  for (const userId of await memberIds(tenantId)) {
    try {
      const ctx = await resolveTenantContext(userId, tenantId);
      if (!ctx) continue;
      const fils = await withTenant(ctx, async (tx) => {
        const changed: string[] = [];
        if (!(await lockAuthor(tx, ctx))) return changed;
        const { rows } = await tx.execute<{ id: string }>(sql`
          select s.id from sources s
          where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
            and exists (
              select 1 from jsonb_array_elements(coalesce(s.metadata->'liees', '[]'::jsonb)) e
              where e->>'id' = any(${textArray(ids)}))
          order by s.id`);
        for (const { id } of rows) {
          if (!(await lockTarget(tx, ctx, id))) continue;
          const fil = await readFil(tx, ctx, id);
          if (!fil) continue;
          const lists = {
            liees: kept(listOf(fil, 'liees')),
            mots_cles: kept(listOf(fil, 'mots_cles')),
          };
          if ((await writeLists(tx, id, lists)) && fil.metadata.absorbe_par === undefined) {
            changed.push(id);
          }
        }
        return changed;
      });
      for (const fil of fils) await queueFilMaj(ctx, fil);
    } catch (error) {
      logError('thread_links.unlink_failed', error, { tenantId, userId });
    }
  }
}

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer un titre ou une branche ;
// seulement son résumé (safeErrorSummary).
async function processLinkJob(data: unknown, deps: { embedder: Embedder | null }): Promise<void> {
  const job = ThreadJobSchema.parse(data);
  try {
    await linkSource(job, deps);
  } catch (error) {
    logError('thread_links.failed', error, { tenantId: job.tenantId, sourceId: job.sourceId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & {
  leonThreadLinksWorker?: Promise<void>;
};

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startThreadLinksWorker(deps: { embedder: Embedder | null }): Promise<void> {
  globalForWorker.leonThreadLinksWorker ??= (async () => {
    const boss = await getThreadsBoss();
    await boss.work(
      LIAISON_QUEUE,
      { batchSize: 1, localConcurrency: LIAISON_CONCURRENCY },
      async ([job]) => processLinkJob(job?.data, deps),
    );
  })().catch((error) => {
    globalForWorker.leonThreadLinksWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonThreadLinksWorker;
}
