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
//   avec l'usage `resume` dont le numéro (`metadata.resume.tour`) n'est pas celui pris en compte (`etat_session`, D21).
//   Le numéro, pas la date : un tour est daté du début de sa transaction, et un résumé validé après la lecture d'un
//   autre peut être plus ancien que lui. Une session ou une source liée de plus ne change que l'état déterministe.
// - L'usage `resume` est relu sous le verrou du fil, juste avant d'écrire : retiré pendant l'appel, rien n'est écrit.
// - Sans modèle, sans résumé nouveau, ou quand la liste blanche ne garde rien, l'état est la liste déterministe des
//   sessions, des PR et des sources liées visibles, écrite par le serveur quand elle change ; une version lisible du
//   modèle n'est pas écrasée (D33). Un modèle en échec n'écrit rien : l'ancien état reste, et pg-boss reprend le job.
// shortcut: l'usage se lit dans `metadata.usages` des sessions, que la route du retrait vide (faits-routes.ts, T43
// amendé le 06/11), sans la borne d'une heure du résumé : l'état relit des sessions anciennes par nature. `leon
// retirer-crochets` n'appelle la route qu'à la PR 3b du lot 12 : d'ici là, un retrait sur le poste seul laisserait
// partir au modèle de l'état les sessions déjà envoyées. instrumentation-node.ts le démarre donc sans modèle ; la PR 3b
// lui donne le modèle, avec l'appel de la route et le rattrapage des retraits faits avant elle.
// shortcut: les sources lues pendant une session (`read_log.session`, D35) n'entrent ni au condensé ni aux entrées :
// la colonne vient avec T44, qui les y ajoute (T44 amendé le 10/11).

export type FilStateOutcome = 'modele' | 'serveur' | 'inchange' | 'depassee' | 'sans-objet';

const FIL_STATE_CONCURRENCY = 2;
// Borne le texte ET la réflexion du modèle (llm.ts) : 2 000 caractères en prennent environ 700, l'effort low peu.
const FIL_MAX_TOKENS = 6000;
const FIL_TIMEOUT_MS = 60_000;
// Les sessions `resume` et les sources liées les plus récentes qu'on lit pour le condensé, au plus : il n'en garde pas
// davantage (une source y prend environ 1 250 caractères sur 40 000).
const CONDENSE_SESSIONS_MAX = 20;
const CONDENSE_SOURCES_MAX = 40;
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
  // Le numéro de son dernier résumé (`metadata.resume.tour`), null sans résumé : `etat_session` le garde.
  resume_tour: string | null;
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
  equipe: boolean;
};
type TailRow = {
  id: string;
  external_id: string;
  role: TurnRole;
  injecte: boolean | null;
  epoch: string;
  text: string;
};
// Les résumés pris en compte (D21) : pour chaque session, le numéro de son dernier résumé.
type EtatSession = Record<string, string>;
type Read = {
  list: Parameters<typeof deterministicState>[0];
  // Le condensé à faire, quand un résumé est nouveau depuis le dernier état.
  // `prs` : les sources GitHub des PR dont l'état entre au condensé, des entrées de la version (D33).
  model: {
    input: { sessions: FilSession[]; sources: FilSource[] };
    tours: EtatSession;
    prs: string[];
  } | null;
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
// résumé nouveau, de quoi faire le condensé. Les textes (résumés, sources liées) ne se lisent que pour lui : l'état
// déterministe n'a besoin que des ids.
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
  const pris = (row.metadata.etat_session as { tours?: unknown } | undefined)?.tours ?? {};
  const { rows: sessions } = await tx.execute<SessionRow>(sql`
    select s.id, s.kind, s.metadata->'faits' as faits, ${USAGE_RESUME} as resume,
      extract(epoch from ${LAST_TS_SQL}) as last_epoch,
      case when r.id is not null then s.metadata->'resume'->>'tour' end as resume_tour,
      (r.id is not null
        and (s.metadata->'resume'->>'tour') is distinct from (${JSON.stringify(pris)}::jsonb ->> s.id::text)) as nouveau
    from sources s
    left join turns r on r.tenant_id = s.tenant_id and r.source_id = s.id
      and r.external_id = ${RESUME_EXTERNAL_PREFIX} || (s.metadata->'resume'->>'tour')
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})
      and s.id = any(${textArray(ids(fil, 'sessions'))}::uuid[])
    order by ${LAST_TS_SQL} desc, s.id`);
  // Une note ou une conversation captée : seulement celle de l'auteur, comme la liaison (thread-links.ts).
  const { rows: linked } = await tx.execute<{ id: string }>(sql`
    select s.id from sources s
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
  if (!withModel || !withResume.some((one) => one.nouveau)) return { list, model: null };
  const tours: EtatSession = Object.fromEntries(
    withResume.flatMap((one) => (one.resume_tour === null ? [] : [[one.id, one.resume_tour]])),
  );

  const kept = withResume.slice(0, CONDENSE_SESSIONS_MAX);
  const { rows: resumes } = await tx.execute<{ id: string; text: string }>(sql`
    select s.id, r.text from sources s
    join turns r on r.tenant_id = s.tenant_id and r.source_id = s.id
      and r.external_id = ${RESUME_EXTERNAL_PREFIX} || (s.metadata->'resume'->>'tour')
    where s.tenant_id = ${ctx.tenantId} and s.id = any(${textArray(kept.map((one) => one.id))}::uuid[])`);
  const resumeOf = new Map(resumes.map((one) => [one.id, one.text]));
  const project = typeof row.metadata.project === 'string' ? row.metadata.project : '';
  const states = await linkPrs(
    tx,
    ctx,
    project,
    kept.map((one): SessionFacts => one.faits),
  );
  // Toutes les copies visibles d'une PR dont l'état entre au condensé : l'une rendue privée (0048), l'état se cache.
  const prKeys = states
    .flat()
    .flatMap((pr) => (pr.etat === null ? [] : [`pr:${pr.repo}#${pr.numero}`.toLowerCase()]));
  const { rows: prSources } = await tx.execute<{ id: string }>(sql`
    select s.id from sources s
    where s.tenant_id = ${ctx.tenantId} and s.kind = 'github'
      and lower(s.external_id) = any(${textArray([...new Set(prKeys)])})`);
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
      resume: resumeOf.get(one.id) ?? null,
      turns: one.faits.externe ? [] : await readTail(tx, ctx, one.id, SESSION_TAIL_CHARS),
    });
  }
  // `equipe` : chacun des tours lus est de l'équipe d'après l'outil ; un tour sans côté (l'outil ne le dit pas) non.
  const { rows: linkedRows } = await tx.execute<SourceRow>(sql`
    select s.id, s.kind, s.external_id, s.title, s.metadata->>'nature' as nature,
      s.metadata->'origin'->>'cote' as cote, s.metadata->>'outil' as outil,
      extract(epoch from ${LAST_TS_SQL}) as last_epoch, x.texte, x.equipe
    from sources s
    cross join lateral (
      select left(string_agg(lus.text, E'\\n' order by lus.ts, lus.id), ${SOURCE_TEXT_CHARS}) as texte,
        coalesce(bool_and(lus.author_side is not distinct from 'team'), false) as equipe
      from (
        select t.id, t.ts, left(t.text, ${SOURCE_TEXT_CHARS}) as text, t.author_side from turns t
        where t.tenant_id = s.tenant_id and t.source_id = s.id
        order by t.ts, t.id limit ${SOURCE_TURNS_MAX}) lus) x
    where s.tenant_id = ${ctx.tenantId}
      and s.id = any(${textArray(list.sources.slice(0, CONDENSE_SOURCES_MAX))}::uuid[])
    order by ${LAST_TS_SQL} desc, s.id`);
  const sources = linkedRows.map(
    (one): FilSource => ({
      id: one.id,
      kind: one.kind,
      externalId: one.external_id,
      nature: one.nature,
      cote: one.cote,
      equipe: one.equipe,
      outil: one.outil,
      titre: one.title,
      date: one.last_epoch === null ? null : epochToDate(one.last_epoch),
      texte: one.texte ?? '',
    }),
  );
  return {
    list,
    model: { input: { sessions: input, sources }, tours, prs: prSources.map((one) => one.id) },
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

// Le verrou du fil (lockTarget, D34), puis `absorbe_par` relu sous lui, comme la liaison (thread-links.ts) : un fil
// absorbé par une fusion validée pendant l'appel au modèle ne change plus.
async function lockFil(tx: Tx, ctx: TenantContext, filId: string): Promise<boolean> {
  if (!(await lockTarget(tx, ctx, filId))) return false;
  const {
    rows: [row],
  } = await tx.execute<{ libre: boolean }>(sql`
    select s.metadata->>'absorbe_par' is null as libre from sources s
    where s.tenant_id = ${ctx.tenantId} and s.id = ${filId}`);
  return row?.libre === true;
}

// L'état du modèle, sous le verrou du fil (lockFil, D34), dans une transaction : l'usage `resume` des sessions du
// condensé relu, la version écrite en compare-and-set, puis `etat_session`. Sans rien de gardé, seul `etat_session`
// avance (pas de second appel pour le même résumé), et rend null : l'appelant passe à l'état déterministe.
async function writeModelState(
  tx: Tx,
  ctx: TenantContext,
  filId: string,
  attendue: number,
  condense: FilCondense,
  kept: { texte: string; cites: string[] } | null,
  model: { tours: EtatSession; prs: string[] },
): Promise<FilStateOutcome | null> {
  if (!(await lockFil(tx, ctx, filId))) return 'sans-objet';
  const {
    rows: [still],
  } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from sources s
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})
      and s.id = any(${textArray(condense.sessions)}::uuid[]) and ${USAGE_RESUME}`);
  if (still?.n !== condense.sessions.length) return 'sans-objet';
  if (kept !== null) {
    const entrees = [...new Set([...condense.sessions, ...condense.sources, ...model.prs])];
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
      || jsonb_build_object('etat_session', jsonb_build_object('tours', ${JSON.stringify(model.tours)}::jsonb))
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
      const { model } = read;
      const written = await withTenant(ctx, (tx) =>
        writeModelState(tx, ctx, job.sourceId, n, condense, kept, model),
      );
      if (written !== null) return written;
    }
  }
  const list = deterministicState(read.list);
  if (list.texte === '' || version?.texte === list.texte) return 'inchange';
  const written = await withTenant(ctx, async (tx) =>
    (await lockFil(tx, ctx, job.sourceId))
      ? writeVersion(tx, ctx, {
          sourceId: job.sourceId,
          attendue: n,
          texte: list.texte,
          entrees: list.entrees,
          ecritPar: 'serveur',
          motif: 'rangement',
        })
      : 'introuvable',
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
