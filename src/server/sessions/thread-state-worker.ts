import { sql } from 'drizzle-orm';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { CAPTURE_KINDS, CODE_SESSION_KINDS, type TurnRole } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { type Llm, LlmError } from '@/server/llm/llm';
import { modelForStep } from '@/server/llm/models';
import { logError, safeErrorSummary } from '@/server/log';
import { lockTarget, readLatest, writeVersion } from '@/server/memory/versions';
import {
  epochToDate,
  LAST_TS_SQL,
  RESUME_EXTERNAL_PREFIX,
  RESUME_LIKE,
  textArray,
} from '@/server/search/filters-sql';
import type { CondenseTurn } from './condense';
import { linkPrs } from './start-context';
import {
  buildFilPrompt,
  condenseFil,
  deterministicState,
  type FilCondense,
  type FilSession,
  type FilSource,
  filterFilState,
} from './thread-state';
import { FIL, type Fil, keyOf, listOf } from './threads';
import {
  FIL_MAJ_QUEUE,
  getThreadsBoss,
  LINKED_KINDS,
  type ThreadJob,
  ThreadJobSchema,
} from './threads-queue';

// Le worker de la file `fil-maj` (T43 ; D23, D33 à D36 du plan de la mémoire à disposition) : l'état d'un fil de
// l'auteur, refait quand le rangement, la liaison ou un résumé le change, sous les droits de l'auteur (withTenant), le
// filtre `owner_user_id` en plus de la sécurité par ligne. Il s'écrit en versions (versions.ts), jamais en tour : ni
// passage, ni vecteur, ni indexation. Les journaux ne citent que des uuid.
//
// - Il lit d'abord vn, le numéro de la dernière version, puis le fil, juste avant l'appel ; il n'écrit v(n+1) que si
//   la dernière est encore vn (compare-and-set, D34). Sinon il s'arrête : la tâche en file refait, avec des données
//   fraîches.
// - L'appel au modèle (étape `fil`) ne part que pour un résumé nouveau depuis le dernier état : celui d'une session
//   avec l'usage `resume` écrit après le dernier pris en compte (`etat_session`, D21). Une session ou une source liée de
//   plus ne change que l'état déterministe.
// - L'usage `resume` est relu sous le verrou du fil, juste avant d'écrire : retiré pendant l'appel, rien n'est écrit.
// - Sans modèle, sans résumé nouveau, ou quand la liste blanche ne garde rien, l'état est la liste déterministe des
//   sessions, des PR et des sources liées visibles, écrite par le serveur quand elle change ; une version lisible du
//   modèle n'est pas écrasée (D33). Un modèle en échec n'écrit rien : l'ancien état reste, et pg-boss reprend le job.
// shortcut: l'usage se lit dans `metadata.usages` des sessions, que la route du retrait vide (faits-routes.ts, T43
// amendé le 06/11), sans la borne d'une heure du résumé : l'état relit des sessions anciennes par nature. `leon
// retirer-crochets` n'appelle la route qu'à la PR 3b du lot 12 : d'ici là, un retrait sur le poste seul laisse partir au
// modèle de l'état les sessions déjà envoyées. Ne pas mettre ce worker en production sans la PR 3b.
// shortcut: les sources lues pendant une session (`read_log.session`, D35) n'entrent ni au condensé ni aux entrées :
// la colonne vient avec T44, qui les y ajoute.

export type FilStateOutcome = 'modele' | 'serveur' | 'inchange' | 'depassee' | 'sans-objet';

const FIL_STATE_CONCURRENCY = 2;
// Borne le texte ET la réflexion du modèle (llm.ts) : 2 000 caractères en prennent environ 700, l'effort low peu.
const FIL_MAX_TOKENS = 6000;
const FIL_TIMEOUT_MS = 60_000;
// Les sessions `resume` les plus récentes qu'on lit pour le condensé, au plus : il n'en garde pas davantage.
const CONDENSE_SESSIONS_MAX = 20;
// La fin des tours d'une session, et le début d'une source liée, lus au plus (thread-state.ts n'en garde pas plus).
const SESSION_TAIL_CHARS = 8000;
const SOURCE_TURNS_MAX = 20;
const SOURCE_TEXT_CHARS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE_RESUME = sql`coalesce(s.metadata->'usages' @> '["resume"]'::jsonb, false)`;

type SessionRow = {
  id: string;
  kind: string;
  faits: unknown;
  resume: boolean;
  last_epoch: string;
  resume_texte: string | null;
  // La date d'écriture de son dernier résumé, en ISO à la microseconde (to_jsonb) : `etat_session` la garde.
  resume_le: string | null;
  nouveau: boolean;
};
type SourceRow = {
  id: string;
  kind: string;
  external_id: string;
  title: string | null;
  nature: string | null;
  cote: string | null;
  outil: string | null;
  last_epoch: string | null;
  texte: string | null;
};
type TailRow = {
  id: string;
  external_id: string;
  role: TurnRole;
  injecte: boolean | null;
  epoch: string;
  text: string;
};
// Le dernier résumé pris en compte (D21) : sa session, et sa date d'écriture.
type EtatSession = { id: string; le: string };
type Read = {
  list: Parameters<typeof deterministicState>[0];
  // Le condensé à faire, quand un résumé est nouveau depuis le dernier état.
  model: { input: { sessions: FilSession[]; sources: FilSource[] }; newest: EtatSession } | null;
};

const ids = (fil: Fil, name: 'sessions' | 'liees') =>
  listOf(fil, name)
    .map(keyOf)
    .filter((id) => UUID.test(id));

// La fin des tours d'une session, sans ses résumés, en `maxChars` caractères au plus (comme resume-worker.ts). Les
// messages seulement : les coulisses du lot 14 n'entrent jamais au condensé (D23).
async function readTail(
  tx: Tx,
  ctx: TenantContext,
  sessionId: string,
  maxChars: number,
): Promise<CondenseTurn[]> {
  const { rows } = await tx.execute<TailRow>(sql`
    select id, external_id, role, injecte, extract(epoch from ts) as epoch, text
    from (
      select t.id, t.external_id, t.role, t.injecte, t.ts, t.created_at, t.text,
        sum(char_length(t.text)) over (order by t.ts desc, t.created_at desc, t.id desc) as running
      from turns t
      where t.tenant_id = ${ctx.tenantId} and t.source_id = ${sessionId}
        and t.external_id not like ${RESUME_LIKE} and t.role in ('user', 'assistant')
    ) recent
    where running - char_length(text) <= ${maxChars}
    order by ts, created_at, id`);
  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    role: row.role,
    ts: epochToDate(row.epoch),
    text: row.text,
    injecte: row.injecte,
  }));
}

// Le fil de l'auteur, hors absorbé, ses sessions de code et ses sources liées qu'il voit ; avec `withModel`, et un
// résumé nouveau, de quoi faire le condensé.
async function readFil(
  tx: Tx,
  ctx: TenantContext,
  filId: string,
  withModel: boolean,
): Promise<Read | null> {
  const {
    rows: [row],
  } = await tx.execute<{ metadata: Record<string, unknown> }>(sql`
    select s.metadata from sources s
    where s.tenant_id = ${ctx.tenantId} and s.id = ${filId} and s.owner_user_id = ${ctx.userId}
      and s.kind = ${FIL} and s.metadata->>'absorbe_par' is null`);
  if (!row) return null;
  const fil: Fil = { id: filId, metadata: row.metadata };
  const { le } = (row.metadata.etat_session ?? {}) as { le?: unknown };
  const { rows: sessions } = await tx.execute<SessionRow>(sql`
    select s.id, s.kind, s.metadata->'faits' as faits, ${USAGE_RESUME} as resume,
      extract(epoch from ${LAST_TS_SQL}) as last_epoch, r.text as resume_texte,
      to_jsonb(r.created_at) #>> '{}' as resume_le,
      coalesce(r.created_at > ${typeof le === 'string' ? le : null}::timestamptz, r.id is not null) as nouveau
    from sources s
    left join turns r on r.tenant_id = s.tenant_id and r.source_id = s.id
      and r.external_id = ${RESUME_EXTERNAL_PREFIX} || (s.metadata->'resume'->>'tour')
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})
      and s.id = any(${textArray(ids(fil, 'sessions'))}::uuid[])
    order by ${LAST_TS_SQL} desc, s.id`);
  // Une note ou une conversation captée : seulement celle de l'auteur, comme la liaison (thread-links.ts).
  const { rows: linked } = await tx.execute<SourceRow>(sql`
    select s.id, s.kind, s.external_id, s.title, s.metadata->>'nature' as nature,
      s.metadata->'origin'->>'cote' as cote, s.metadata->>'outil' as outil,
      extract(epoch from ${LAST_TS_SQL}) as last_epoch,
      (select string_agg(x.text, E'\\n' order by x.ts, x.id) from (
        select t.id, t.ts, left(t.text, ${SOURCE_TEXT_CHARS}) as text from turns t
        where t.tenant_id = s.tenant_id and t.source_id = s.id
        order by t.ts, t.id limit ${SOURCE_TURNS_MAX}) x) as texte
    from sources s
    where s.tenant_id = ${ctx.tenantId} and s.id = any(${textArray(ids(fil, 'liees'))}::uuid[])
      and s.kind = any(${textArray([...LINKED_KINDS])})
      and (s.kind <> all(${textArray(CAPTURE_KINDS)}) or s.owner_user_id = ${ctx.userId})
    order by ${LAST_TS_SQL} desc, s.id`);
  const prs = listOf(fil, 'prs').flatMap((pr) => {
    const { repo, numero } = (pr ?? {}) as Record<string, unknown>;
    return typeof repo === 'string' && typeof numero === 'number' ? [{ repo, numero }] : [];
  });
  const list = {
    sessions: sessions.map((one) => one.id),
    prs,
    sources: linked.map((one) => one.id),
  };

  const withResume = sessions.flatMap((one) => {
    const faits = SessionFactsSchema.safeParse(one.faits);
    return one.resume && faits.success ? [{ ...one, faits: faits.data }] : [];
  });
  const newest = withResume
    .filter((one) => one.resume_le !== null)
    .toSorted((a, b) => Date.parse(b.resume_le ?? '') - Date.parse(a.resume_le ?? ''))[0];
  if (!withModel || !newest?.resume_le || !withResume.some((one) => one.nouveau && one.resume_le)) {
    return { list, model: null };
  }

  const kept = withResume.slice(0, CONDENSE_SESSIONS_MAX);
  const project = typeof row.metadata.project === 'string' ? row.metadata.project : '';
  const states = await linkPrs(
    tx,
    ctx,
    project,
    kept.map((one): SessionFacts => one.faits),
  );
  const input: FilSession[] = [];
  for (const [index, one] of kept.entries()) {
    input.push({
      id: one.id,
      kind: one.kind,
      date: epochToDate(one.last_epoch),
      faits: {
        ...one.faits,
        prs: (states[index] ?? []).map((pr) => ({
          repo: pr.repo,
          numero: pr.numero,
          etat: pr.etat,
        })),
      },
      resume: one.resume_texte,
      turns: one.faits.externe ? [] : await readTail(tx, ctx, one.id, SESSION_TAIL_CHARS),
    });
  }
  const sources = linked.map(
    (one): FilSource => ({
      id: one.id,
      kind: one.kind,
      externalId: one.external_id,
      nature: one.nature,
      cote: one.cote,
      outil: one.outil,
      titre: one.title,
      date: one.last_epoch === null ? null : epochToDate(one.last_epoch),
      texte: one.texte ?? '',
    }),
  );
  return {
    list,
    model: { input: { sessions: input, sources }, newest: { id: newest.id, le: newest.resume_le } },
  };
}

async function askModel(llm: Llm, condense: FilCondense): Promise<string> {
  const prompt = buildFilPrompt(condense);
  let answer = '';
  for await (const delta of llm.streamText({
    step: 'fil',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: FIL_MAX_TOKENS,
    signal: AbortSignal.timeout(FIL_TIMEOUT_MS),
  })) {
    answer += delta;
  }
  if (answer.trim() === '') throw new LlmError('réponse vide');
  return answer;
}

// L'état du modèle, sous le verrou du fil (lockTarget, D34), dans une transaction : l'usage `resume` des sessions du
// condensé relu, la version écrite en compare-and-set, puis `etat_session`. Sans rien de gardé, seul `etat_session`
// avance (pas de second appel pour le même résumé), et rend null : l'appelant passe à l'état déterministe.
async function writeModelState(
  tx: Tx,
  ctx: TenantContext,
  filId: string,
  attendue: number,
  condense: FilCondense,
  kept: { texte: string; cites: string[] } | null,
  newest: EtatSession,
): Promise<FilStateOutcome | null> {
  if (!(await lockTarget(tx, ctx, filId))) return 'sans-objet';
  const {
    rows: [still],
  } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from sources s
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})
      and s.id = any(${textArray(condense.sessions)}::uuid[]) and ${USAGE_RESUME}`);
  if (still?.n !== condense.sessions.length) return 'sans-objet';
  if (kept !== null) {
    const entrees = [...condense.sessions, ...condense.sources];
    const written = await writeVersion(tx, ctx, {
      sourceId: filId,
      attendue,
      texte: kept.texte,
      entrees,
      // Les tours cités, pour la provenance seulement (D33) : ni une session, ni une source, ni une PR, ni un commit.
      tours: kept.cites.filter((id) => UUID.test(id) && !entrees.includes(id)),
      ecritPar: 'modele',
      motif: 'rangement',
      etape: 'fil',
      modele: modelForStep('fil', env),
    });
    if (written === 'depassee') return 'depassee';
    if (typeof written !== 'object') return 'sans-objet';
  }
  await tx.execute(sql`update sources s set metadata = s.metadata
      || jsonb_build_object('etat_session', jsonb_build_object('id', ${newest.id}::text, 'le', ${newest.le}::text))
    where s.tenant_id = ${ctx.tenantId} and s.id = ${filId}`);
  return kept === null ? null : 'modele';
}

export async function updateFilState(
  job: ThreadJob,
  deps: { llm: Llm | null },
): Promise<FilStateOutcome> {
  const ctx = await resolveTenantContext(job.ownerUserId, job.tenantId);
  // Parti de l'organisation : plus personne sous les droits de qui écrire.
  if (!ctx) return 'sans-objet';
  const { n, version } = await readLatest(ctx, job.sourceId);
  const read = await withTenant(ctx, (tx) => readFil(tx, ctx, job.sourceId, deps.llm !== null));
  if (read === null) return 'sans-objet';
  const { llm } = deps;
  if (llm !== null && read.model !== null) {
    const condense = condenseFil(read.model.input);
    if (condense.sessions.length > 0) {
      const kept = filterFilState(await askModel(llm, condense), condense);
      const { newest } = read.model;
      const written = await withTenant(ctx, (tx) =>
        writeModelState(tx, ctx, job.sourceId, n, condense, kept, newest),
      );
      if (written !== null) return written;
    }
  }
  const list = deterministicState(read.list);
  if (list.texte === '' || version?.texte === list.texte) return 'inchange';
  const written = await withTenant(ctx, (tx) =>
    writeVersion(tx, ctx, {
      sourceId: job.sourceId,
      attendue: n,
      texte: list.texte,
      entrees: list.entrees,
      ecritPar: 'serveur',
      motif: 'rangement',
    }),
  );
  if (typeof written === 'object') return 'serveur';
  if (written === 'gardee') return 'inchange';
  return written === 'depassee' ? 'depassee' : 'sans-objet';
}

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer du texte capté (une
// erreur de base cite ses paramètres) ; seulement son résumé (safeErrorSummary).
async function processFilJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  const job = ThreadJobSchema.parse(data);
  try {
    await updateFilState(job, deps);
  } catch (error) {
    logError('fil_etat.failed', error, { tenantId: job.tenantId, sourceId: job.sourceId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonFilStateWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startFilStateWorker(deps: { llm: Llm | null }): Promise<void> {
  globalForWorker.leonFilStateWorker ??= (async () => {
    const boss = await getThreadsBoss();
    await boss.work(
      FIL_MAJ_QUEUE,
      { batchSize: 1, localConcurrency: FIL_STATE_CONCURRENCY },
      async ([job]) => processFilJob(job?.data, deps),
    );
  })().catch((error) => {
    globalForWorker.leonFilStateWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonFilStateWorker;
}
