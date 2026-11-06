import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { CODE_SESSION_KINDS, type SourceKind } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { organizations, users } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { Embedder } from '@/server/embeddings/embedder';
import { logError, safeErrorSummary } from '@/server/log';
import { lockTarget } from '@/server/memory/versions';
import { epochToDate, LAST_TS_SQL, RESUME_LIKE, textArray } from '@/server/search/filters-sql';
import { DEFAULT_BRANCHES } from './start-context';
import {
  enqueueFilMaj,
  getThreadsBoss,
  RANGEMENT_QUEUE,
  type ThreadJob,
  ThreadJobSchema,
} from './threads-queue';

// Le rangement des sessions en fils de travail (T40 et T41 ; D21, D22 et D34 du plan de la mémoire à disposition), sans
// modèle. Pour une session de code de l'auteur, sous ses droits (withTenant), en une transaction :
// - la session rejoint le fil de sa branche (hors main et master), sinon celui d'une de ses PR, ouvert s'il manque ;
// - sans branche ni PR, elle reste dans un fil qui l'a déjà (le premier par id, sans fusion), sinon rejoint le fil le
//   plus proche par le vecteur de son résumé (nearestFil), et n'en ouvre jamais. Sans résumé, sans l'usage `resume`,
//   sans vecteur ou sans fournisseur, elle reste hors fil ; l'écriture des vecteurs d'un résumé la remet à ranger
//   (embed-missing.ts) ;
// - les fils de l'auteur qui ont sa branche ou une de ses PR fusionnent dans le plus ancien. L'absorbé reste, marqué
//   `absorbe_par`, avec ses listes et ses versions (D21, tranché le 05/11) ; le rangement le saute ;
// - un fil qui change est mis en file `fil-maj` (T43) : le rangement n'écrit jamais l'état.
// Seul le filtre de l'auteur et de CODE_SESSION_KINDS choisit la session : jamais celle d'un collègue, même partagée.
// Les journaux ne citent que des uuid, jamais une branche, un fichier ni une PR.
//
// Les verrous, toujours dans cet ordre : celui de l'auteur (consultatif, pour la transaction), l'organisation en FOR
// KEY SHARE, puis les fils par lockTarget (versions.ts), dans l'ordre des ids, la fusion comprise. Un fil de branche
// s'ouvre par la contrainte unique de `sources` (on conflict do nothing), puis se verrouille (D34). Le verrou de
// l'auteur sérialise ses rangements : sans lui, deux sessions de branches neuves qui partagent une PR, rangées au même
// moment, ouvriraient chacune son fil sans voir l'autre. Seul le rangement le prend, et toujours en premier.

const FIL = 'leon_fil' satisfies SourceKind;
const FICHIERS_MAX = 50;
const RANGEMENT_CONCURRENCY = 2;
// La distance cosinus (0 : même sens, 1 : sans rapport) sous laquelle deux résumés sont du même travail, et l'écart
// qu'ils peuvent avoir au plus (D22).
// shortcut: une valeur prudente, deux fois plus stricte que celle de la recherche (MAX_VECTOR_DISTANCE, mesurée avec
// voyage-4 sur des passages, pas sur des résumés) ; le lot 11 (T38) la règle sur des cas réels.
const PROCHE_MAX_DISTANCE = 0.3;
const PROCHE_JOURS = 30;
// Les listes du `metadata` d'un fil (D21) que le rangement écrit et qu'une fusion réunit. `liees` vient de T42, qui
// ajoute ici ses autres listes.
type Liste = 'branches' | 'prs' | 'sessions' | 'fichiers' | 'liees' | 'absorbes';

export type FilingOutcome = 'range' | 'inchange' | 'hors-fil' | 'sans-objet';

type Fil = { id: string; metadata: Record<string, unknown> };
type SessionRow = {
  kind: string;
  project: string | null;
  faits: unknown;
  last_epoch: string;
  resume: boolean;
};

// `leon:fil:<projet>:<clé>` (D21) : un condensé de la branche, jamais la branche, ou un uuid pour un fil sans branche.
const filKey = (project: string, branch: string | null) =>
  `leon:fil:${project}:${branch === null ? randomUUID() : createHash('sha256').update(branch).digest('hex').slice(0, 32)}`;

// La clé d'un élément de liste : un texte, l'id d'une session ou d'une source liée, ou une PR sans la casse.
function keyOf(item: unknown): string {
  if (typeof item === 'string') return item;
  const { id, repo, numero } = (item ?? {}) as Record<string, unknown>;
  if (typeof id === 'string') return id;
  if (typeof repo === 'string') return `${repo}#${String(numero)}`.toLowerCase();
  return JSON.stringify(item);
}
// Des listes réunies sans doublon : un élément garde sa place et prend sa dernière valeur (Map garde l'ordre).
function union(...lists: unknown[][]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const list of lists) for (const item of list) byKey.set(keyOf(item), item);
  return [...byKey.values()];
}
const listOf = (fil: Fil, name: Liste): unknown[] => {
  const value = fil.metadata[name];
  return Array.isArray(value) ? value : [];
};

// Avant tout fil : le verrou de l'auteur, puis l'organisation en FOR KEY SHARE, comme lockTarget. Une suppression du
// compte est alors validée avant (l'auteur se lit supprimé, rien n'est rangé), ou attend la fin du rangement et
// emporte le fil (supprimer_fil).
async function lockAuthor(tx: Tx, ctx: TenantContext): Promise<boolean> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`leon:fils:${ctx.tenantId}:${ctx.userId}`}, 0))`,
  );
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId))
    .for('key share');
  if (!organization) return false;
  const [author] = await tx
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, ctx.userId));
  return author !== undefined && author.deletedAt === null;
}

// La session de l'auteur : le filtre `owner_user_id` en plus de la sécurité par ligne, et un kind de session de code.
// `resume` : l'usage du dernier envoi de faits, comme à la lecture de l'état (versions.ts) ; retiré, l'ancien résumé
// garde ses passages mais ne rattache plus.
async function readSession(
  tx: Tx,
  ctx: TenantContext,
  sessionId: string,
): Promise<(Omit<SessionRow, 'faits'> & { faits: SessionFacts }) | null> {
  const {
    rows: [row],
  } = await tx.execute<SessionRow>(sql`
    select s.kind, s.metadata->>'project' as project, s.metadata->'faits' as faits,
      extract(epoch from ${LAST_TS_SQL}) as last_epoch,
      coalesce(s.metadata->'usages' @> '["resume"]'::jsonb, false) as resume
    from sources s
    where s.tenant_id = ${ctx.tenantId} and s.id = ${sessionId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})`);
  const faits = SessionFactsSchema.safeParse(row?.faits);
  return row && faits.success ? { ...row, faits: faits.data } : null;
}

// Ouvre un fil de l'auteur : rend son id, ou null si sa clé existe déjà (la contrainte unique de `sources`).
async function createFil(
  tx: Tx,
  ctx: TenantContext,
  project: string,
  branch: string | null,
): Promise<string | null> {
  const [created] = await tx
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: FIL,
      externalId: filKey(project, branch),
      ownerUserId: ctx.userId,
      acl: [ctx.userId],
      metadata: { project, branches: branch === null ? [] : [branch] },
    })
    .onConflictDoNothing({
      target: [sources.tenantId, sources.ownerUserId, sources.kind, sources.externalId],
    })
    .returning({ id: sources.id });
  return created?.id ?? null;
}

// Une clé d'un fil : cet élément dans une de ses listes.
const has = (name: Liste, item: unknown) =>
  sql`s.metadata->${name}::text @> ${JSON.stringify([item])}::jsonb`;

// Les fils de l'auteur sur ce projet, hors absorbés, qui ont une de ces clés, dans l'ordre des ids (D34).
async function findFils(
  tx: Tx,
  ctx: TenantContext,
  project: string,
  keys: SQL[],
): Promise<string[]> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select s.id from sources s
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
      and s.metadata->>'project' = ${project} and s.metadata->>'absorbe_par' is null
      and (${sql.join(keys, sql` or `)})
    order by s.id`);
  return rows.map((row) => row.id);
}

// Le fil de l'auteur sur ce projet le plus proche de la session (D22) : la plus petite distance entre un passage de son
// résumé et un passage du résumé d'une autre de ses sessions du fil, datés à PROCHE_JOURS au plus l'un de l'autre, sous
// le seuil. Seul le dernier résumé d'une session a des passages (resume-worker.ts, index-run.ts). Rend null sans
// vecteur de ce modèle pour le résumé, ou sans fil assez proche.
async function nearestFil(
  tx: Tx,
  ctx: TenantContext,
  sessionId: string,
  project: string,
  model: string,
): Promise<string | null> {
  const {
    rows: [nearest],
  } = await tx.execute<{ id: string }>(sql`
    select f.id, min(v.embedding <=> m.embedding) as dist
    from sources f
    cross join lateral jsonb_array_elements(f.metadata->'sessions') e
    join sources s on s.tenant_id = f.tenant_id and s.id = (e->>'id')::uuid
    join passages p on p.tenant_id = s.tenant_id and p.source_id = s.id
    join turns t on t.tenant_id = p.tenant_id and t.id = p.turn_id
    join passage_vectors v on v.passage_id = p.id and v.model = ${model}
    join (
      select mp.ts, mv.embedding
      from passages mp
      join turns mt on mt.tenant_id = mp.tenant_id and mt.id = mp.turn_id
      join passage_vectors mv on mv.passage_id = mp.id and mv.model = ${model}
      where mp.tenant_id = ${ctx.tenantId} and mp.source_id = ${sessionId}
        and mt.external_id like ${RESUME_LIKE}
    ) m on p.ts between m.ts - make_interval(days => ${PROCHE_JOURS})
      and m.ts + make_interval(days => ${PROCHE_JOURS})
    where f.tenant_id = ${ctx.tenantId} and f.owner_user_id = ${ctx.userId} and f.kind = ${FIL}
      and f.metadata->>'project' = ${project} and f.metadata->>'absorbe_par' is null
      and s.id <> ${sessionId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)}) and t.external_id like ${RESUME_LIKE}
    group by f.id
    having min(v.embedding <=> m.embedding) < ${PROCHE_MAX_DISTANCE}
    order by dist, f.id
    limit 1`);
  return nearest?.id ?? null;
}

async function range(
  tx: Tx,
  ctx: TenantContext,
  sessionId: string,
  model: string | null,
): Promise<Exclude<FilingOutcome, 'range'> | { fil: string }> {
  if (!(await lockAuthor(tx, ctx))) return 'sans-objet';
  const session = await readSession(tx, ctx, sessionId);
  if (!session) return 'sans-objet';
  const { faits, project } = session;
  const branch =
    faits.branche !== null && !DEFAULT_BRANCHES.has(faits.branche) ? faits.branche : null;
  // Comme les clés des PR de GitHub : le dépôt sans la casse (start-context.ts).
  const prs = faits.prs.map((pr) => ({ repo: pr.repo.toLowerCase(), numero: pr.numero }));
  if (project === null) return 'hors-fil';

  let ids: string[];
  if (branch === null && prs.length === 0) {
    // Sans clé (T41) : un fil qui l'a déjà, sinon le plus proche, jamais un fil ouvert. Un seul : deux fils qui l'ont
    // (elle a changé de branche) ne partagent ni branche ni PR, et ne fusionnent pas (D22).
    ids = (await findFils(tx, ctx, project, [has('sessions', { id: sessionId })])).slice(0, 1);
    if (ids.length === 0 && model !== null && session.resume) {
      const nearest = await nearestFil(tx, ctx, sessionId, project, model);
      if (nearest !== null) ids = [nearest];
    }
    if (ids.length === 0) return 'hors-fil';
  } else {
    // Le fil d'une branche existe dès qu'elle a été vue, même absorbé : sa clé ne s'ouvre qu'une fois, et le fil gardé
    // reprend ses branches.
    if (branch !== null) await createFil(tx, ctx, project, branch);
    ids = await findFils(tx, ctx, project, [
      ...(branch === null ? [] : [has('branches', branch)]),
      ...prs.map((pr) => has('prs', pr)),
    ]);
    if (ids.length === 0) {
      const created = branch === null ? await createFil(tx, ctx, project, null) : null;
      if (created === null) throw new Error('fil de la branche introuvable');
      ids = [created];
    }
  }
  for (const id of ids) {
    if (!(await lockTarget(tx, ctx, id))) throw new Error('fil introuvable');
  }
  // Relus sous le verrou : ce que T42 ou T43 y a écrit entre-temps n'est pas perdu.
  const [keeper, ...others] = await tx
    .select({ id: sources.id, metadata: sources.metadata })
    .from(sources)
    .where(and(eq(sources.tenantId, ctx.tenantId), inArray(sources.id, ids)))
    .orderBy(asc(sources.createdAt), asc(sources.id));
  if (!keeper) throw new Error('fil introuvable');

  const entry = {
    id: sessionId,
    kind: session.kind,
    date: epochToDate(session.last_epoch).toISOString(),
  };
  const merged = (name: Liste) =>
    union(listOf(keeper, name), ...others.map((fil) => listOf(fil, name)));
  const lists: Record<Liste, unknown[]> = {
    branches: union(merged('branches'), branch === null ? [] : [branch]),
    prs: union(merged('prs'), prs),
    sessions: union(merged('sessions'), [entry]),
    fichiers: union(merged('fichiers'), faits.fichiers).slice(-FICHIERS_MAX),
    liees: merged('liees'),
    absorbes: union(
      merged('absorbes'),
      others.map((fil) => fil.id),
    ),
  };
  // Rien de changé (jsonb compare sans l'ordre des clés) : rien n'est écrit. Une fusion change toujours `absorbes`.
  const patch = sql`${JSON.stringify(lists)}::jsonb`;
  const updated = await tx
    .update(sources)
    .set({ metadata: sql`${sources.metadata} || ${patch} || jsonb_build_object('maj_le', now())` })
    .where(
      and(
        eq(sources.id, keeper.id),
        sql`${sources.metadata} || ${patch} is distinct from ${sources.metadata}`,
      ),
    )
    .returning({ id: sources.id });
  if (updated.length === 0) return 'inchange';
  for (const fil of others) {
    await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || jsonb_build_object('absorbe_par', ${keeper.id}::text, 'maj_le', now())`,
      })
      .where(eq(sources.id, fil.id));
  }
  return { fil: keeper.id };
}

// Range la session du job. Idempotent : un envoi répété ne change rien, et rien ne part en file. Sans fournisseur de
// vecteurs, une session sans clé n'est jamais rattachée.
export async function fileSession(
  job: ThreadJob,
  deps: { embedder: Embedder | null },
): Promise<FilingOutcome> {
  const ctx = await resolveTenantContext(job.ownerUserId, job.tenantId);
  // Parti de l'organisation : plus personne sous les droits de qui ranger.
  if (!ctx) return 'sans-objet';
  const model = deps.embedder?.model ?? null;
  const result = await withTenant(ctx, (tx) => range(tx, ctx, job.sourceId, model));
  if (typeof result === 'string') return result;
  // Après la validation, pour que la mise à jour lise le fil rangé. Une file indisponible ne défait pas le rangement :
  // le prochain changement du fil le remet en file.
  try {
    await enqueueFilMaj({ tenantId: ctx.tenantId, sourceId: result.fil, ownerUserId: ctx.userId });
  } catch (error) {
    logError('threads.fil_maj_enqueue', error, { tenantId: ctx.tenantId, sourceId: result.fil });
  }
  return 'range';
}

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer une branche (une erreur
// de base cite ses paramètres) ; seulement son résumé (safeErrorSummary).
async function processThreadJob(data: unknown, deps: { embedder: Embedder | null }): Promise<void> {
  const job = ThreadJobSchema.parse(data);
  try {
    await fileSession(job, deps);
  } catch (error) {
    logError('threads.failed', error, { tenantId: job.tenantId, sourceId: job.sourceId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonThreadsWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startThreadsWorker(deps: { embedder: Embedder | null }): Promise<void> {
  globalForWorker.leonThreadsWorker ??= (async () => {
    const boss = await getThreadsBoss();
    await boss.work(
      RANGEMENT_QUEUE,
      { batchSize: 1, localConcurrency: RANGEMENT_CONCURRENCY },
      async ([job]) => processThreadJob(job?.data, deps),
    );
  })().catch((error) => {
    globalForWorker.leonThreadsWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonThreadsWorker;
}
