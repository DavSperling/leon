import { sql } from 'drizzle-orm';
import { type PassationType, parseNote } from '@/capture/passation-format';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { CODE_SESSION_KINDS, type TurnRole } from '@/capture/turn';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { createIngestRun, enqueueIndexing, insertNewTurns } from '@/server/ingest/ingest-turns';
import { type Llm, LlmError } from '@/server/llm/llm';
import { logError, safeErrorSummary } from '@/server/log';
import {
  epochToDate,
  RESUME_EXTERNAL_PREFIX,
  RESUME_LIKE,
  textArray,
} from '@/server/search/filters-sql';
import {
  CONDENSE_MAX_CHARS,
  type Condense,
  type CondenseFacts,
  type CondenseTurn,
  condenseSession,
} from './condense';
import { buildResumePrompt, RIEN_A_RETENIR } from './resume-prompt';
import {
  enqueueResume,
  getResumeBoss,
  RESUME_END_SECONDS,
  RESUME_IDLE_SECONDS,
  RESUME_QUEUE,
  type ResumeJob,
  ResumeJobSchema,
} from './resume-queue';
import { linkPrs } from './start-context';

// Le worker du résumé d'une session (T23, D8 et D9 du plan mémoire des sessions ; D23, D25 et D30 du plan de la
// mémoire à disposition). Pour une session close, un appel au modèle (étape `resume`) sur son condensé (condense.ts),
// sous les droits de son auteur, puis un tour `leon:resume:<n>` de la session, indexé : la recherche trouve les
// résumés. Rien sans l'usage `resume` de l'outil (C7 révisé), relu avant l'appel et à l'écriture.
//
// - Une session est close après une vraie fin (60 s, resume-queue.ts) ou 15 min sans tour : sans fin, ou après une
//   fin suivie d'un tour plus tardif (la session a repris), un tour arrivé depuis moins de 15 min remet le résumé en
//   file.
// - Un appel par (session, dernier tour résumé) : `metadata.resume` vaut `{ dernier_tour, tour }`, le dernier tour
//   capté que le résumé couvre et le n de son tour `leon:resume:<n>`. Une session qui reprend est résumée à nouveau ;
//   les passages de l'ancien résumé sont supprimés, son tour reste, hors de la lecture (filters-sql.ts).
// - Le résumé ne compte ni comme tour de la session (`lastTurnAt` n'avance pas, il est daté du dernier tour résumé),
//   ni dans le report, ni dans le condensé suivant, ni dans le point du matin (gather.ts). Il est à son auteur seul.
// - La réponse passe par la liste blanche (D8 amendée) : « ## Où j'en suis » et les types de la passation, une
//   `[décision]` seulement si sa source est un id vérifié du condensé (D23) ; les relations viennent des faits.
//
// Sans modèle, un job finit sans rien faire, comme le point du matin.
// shortcut: la capture ne marque pas encore les tours `user` injectés (T43) : en attendant, aucun tour ne prouve une
// `[décision]`, seulement une PR ou un commit du condensé (D23, D36). Quand `turns.injecte` existe (lot 12), passer
// `injecte` à condenseSession et garder ses preuves telles quelles.

export const RESUME_MIN_ECHANGES = 6;
const RESUME_MAX_CHARS = 1200;
// Borne le texte ET la réflexion du modèle (llm.ts) : 1 200 caractères en prennent environ 400, l'effort low peu.
const RESUME_MAX_TOKENS = 4000;
const RESUME_TIMEOUT_MS = 60_000;
const RESUME_CONCURRENCY = 2;
const USAGE_RESUME = sql`coalesce(s.metadata->'usages' @> '["resume"]'::jsonb, false)`;

export type ResumeOutcome = 'ecrit' | 'rien' | 'reporte' | 'sans-objet';

type SourceRow = {
  project: string | null;
  faits: unknown;
  fin_epoch: string | null;
  dernier: string | null;
  resume: boolean;
};
type TailRow = {
  id: string;
  external_id: string;
  role: TurnRole;
  epoch: string;
  text: string;
  arrived_epoch: string;
};
type Ready = {
  faits: SessionFacts;
  condenseFacts: CondenseFacts;
  turns: CondenseTurn[];
  last: CondenseTurn;
};

// Ce que le résumé lit, juste avant l'appel : la session de l'auteur (le filtre `owner_user_id` en plus de la sécurité
// par ligne : jamais celle d'un collègue partagée avec lui), son usage, ses faits, et la fin de ses tours.
async function readSession(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
): Promise<Ready | { reportSeconds: number } | null> {
  const {
    rows: [source],
  } = await tx.execute<SourceRow>(sql`
    select s.metadata->>'project' as project, s.metadata->'faits' as faits,
      extract(epoch from (s.metadata->>'fin_le')::timestamptz) as fin_epoch,
      s.metadata->'resume'->>'dernier_tour' as dernier, ${USAGE_RESUME} as resume
    from sources s
    where s.tenant_id = ${ctx.tenantId} and s.id = ${sourceId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(CODE_SESSION_KINDS)})`);
  if (!source?.resume) return null;
  const parsed = SessionFactsSchema.safeParse(source.faits);
  if (!parsed.success || parsed.data.echanges < RESUME_MIN_ECHANGES) return null;

  // La fin des tours, sans les résumés, en CONDENSE_MAX_CHARS caractères au plus (le condensé n'en garde pas plus) :
  // une session de 5 000 tours n'est pas lue en entier. `arrived` : le dernier tour capté, sur toute la session.
  const { rows } = await tx.execute<TailRow>(sql`
    select id, external_id, role, extract(epoch from ts) as epoch, text,
      extract(epoch from arrived) as arrived_epoch
    from (
      select t.id, t.external_id, t.role, t.ts, t.created_at, t.text,
        sum(char_length(t.text)) over (order by t.ts desc, t.created_at desc, t.id desc) as running,
        max(t.created_at) over () as arrived
      from turns t
      where t.tenant_id = ${ctx.tenantId} and t.source_id = ${sourceId}
        and t.external_id not like ${RESUME_LIKE}
    ) recent
    where running - char_length(text) <= ${CONDENSE_MAX_CHARS}
    order by ts, created_at, id`);
  const turns = rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    role: row.role,
    ts: epochToDate(row.epoch),
    text: row.text,
  }));
  const last = turns.at(-1);
  if (!last || last.id === source.dernier) return null;
  const arrivedMs = epochToDate(rows[0]?.arrived_epoch ?? 0).getTime();
  // Une vraie fin couvre les tours arrivés jusqu'à 60 s après elle ; un tour plus tardif : la session a repris.
  const closed =
    source.fin_epoch !== null &&
    arrivedMs <= epochToDate(source.fin_epoch).getTime() + RESUME_END_SECONDS * 1000;
  const idleMs = Date.now() - arrivedMs;
  if (!closed && idleMs < RESUME_IDLE_SECONDS * 1000) {
    return { reportSeconds: Math.ceil(RESUME_IDLE_SECONDS - idleMs / 1000) };
  }

  const [prs = []] = await linkPrs(tx, ctx, source.project ?? '', [parsed.data]);
  const condenseFacts = {
    ...parsed.data,
    prs: prs.map((pr) => ({ repo: pr.repo, numero: pr.numero, etat: pr.etat })),
  };
  return { faits: parsed.data, condenseFacts, turns, last };
}

async function askModel(llm: Llm, condense: Condense): Promise<string> {
  const prompt = buildResumePrompt(condense);
  let answer = '';
  for await (const delta of llm.streamText({
    step: 'resume',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: RESUME_MAX_TOKENS,
    signal: AbortSignal.timeout(RESUME_TIMEOUT_MS),
  })) {
    answer += delta;
  }
  // Une réponse vide n'est pas « rien à retenir » : le job échoue et sera repris.
  if (answer.trim() === '') throw new LlmError('réponse vide');
  return answer;
}

const TAGS: Record<PassationType, string> = {
  en_cours: 'en-cours',
  prochaine_etape: 'prochaine-étape',
  essai_rate: 'essai-raté',
  question: 'question',
  decision: 'décision',
};
const HEADING = "## Où j'en suis";
const SOURCE = /\(source:\s*([^()\s]+)\)\s*$/;
// Une cible de relation tient sur une ligne et ne ferme pas le lien : une branche nommée sur le poste (ou masquée,
// « [secret masqué] ») qui en sortirait n'est pas écrite.
const SAFE_TARGET = /^[^\s[\]]{1,200}$/;

// La liste blanche (D8 amendée, D23) : le paragraphe « ## Où j'en suis » et les lignes des types de la passation, en
// RESUME_MAX_CHARS caractères ; une `[décision]` seulement si elle cite un id du condensé qui peut la prouver. Tout le
// reste est retiré : les autres types (dont `[consigne]`), les titres, les relations écrites par le modèle. Le serveur
// ajoute les relations tirées des faits, après le paragraphe, au niveau de la note (passation-format.ts). Rend null
// quand rien n'est gardé.
export function filterResume(
  answer: string,
  preuves: Set<string>,
  faits: SessionFacts,
): string | null {
  const note = parseNote(answer);
  const paragraph = note.resume?.slice(0, RESUME_MAX_CHARS - HEADING.length - 2).toWellFormed();
  const head = paragraph === undefined ? [] : [HEADING, paragraph, ''];
  let used = head.join('\n').length;
  const items: string[] = [];
  for (const item of note.items) {
    if (item.type === 'decision' && !preuves.has(SOURCE.exec(item.texte)?.[1] ?? '')) continue;
    const line = `- [${TAGS[item.type]}] ${item.texte}`;
    if (used + line.length + 1 > RESUME_MAX_CHARS) break;
    items.push(line);
    used += line.length + 1;
  }
  if (head.length === 0 && items.length === 0) return null;
  const relations = [
    ...faits.prs.map((pr) => `- pr [[${pr.repo}#${pr.numero}]]`),
    ...(faits.branche && SAFE_TARGET.test(faits.branche) ? [`- branche [[${faits.branche}]]`] : []),
    ...faits.commits.map((sha) => `- commit [[${sha}]]`),
  ];
  return [...head, ...relations, ...items].join('\n').trim();
}

const isNothing = (answer: string) =>
  answer
    .trim()
    .replace(/[.!\s]+$/u, '')
    .toLowerCase() === RIEN_A_RETENIR;

// L'écriture, en une transaction, sous les droits de l'auteur. `metadata.resume` se pose par fusion en SQL, comme les
// faits (record-facts.ts) : des faits rangés pendant l'appel ne sont pas perdus. La même requête relit l'usage
// `resume` : retiré pendant l'appel, rien n'est écrit. Rend le run d'indexation du nouveau résumé, ou null.
async function writeResume(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
  last: CondenseTurn,
  texte: string | null,
): Promise<string | null> {
  const where = sql`s.tenant_id = ${ctx.tenantId} and s.id = ${sourceId}
    and s.owner_user_id = ${ctx.userId} and ${USAGE_RESUME}`;
  if (texte === null) {
    // Rien à retenir : le dernier tour est noté (pas de second appel), l'ancien résumé reste le dernier.
    await tx.execute(sql`update sources s set metadata = s.metadata || jsonb_build_object('resume',
        coalesce(s.metadata->'resume', '{}'::jsonb) || jsonb_build_object('dernier_tour', ${last.id}::text))
      where ${where}`);
    return null;
  }
  // Le n suivant, après ceux déjà écrits (un tour au nom forgé par le poste, `leon:resume:x`, ne le gêne pas). La
  // position est typée : sans `::int`, Postgres lirait substring(texte from motif), une expression régulière.
  const {
    rows: [next],
  } = await tx.execute<{ n: number }>(sql`
    select (coalesce(max(substring(t.external_id from ${RESUME_EXTERNAL_PREFIX.length + 1}::int)::bigint), 0) + 1)::int as n
    from turns t
    where t.tenant_id = ${ctx.tenantId} and t.source_id = ${sourceId}
      and t.external_id ~ ${`^${RESUME_EXTERNAL_PREFIX}[0-9]{1,9}$`}`);
  const n = next?.n ?? 1;
  const { rows: updated } = await tx.execute(sql`update sources s set metadata = s.metadata
      || jsonb_build_object('resume', jsonb_build_object('dernier_tour', ${last.id}::text, 'tour', ${n}::int))
    where ${where} returning s.id`);
  if (updated.length === 0) return null;
  // Les passages des résumés précédents, et leurs vecteurs (on delete cascade) : la recherche ne trouve que le dernier.
  await tx.execute(sql`delete from passages p using turns t
    where p.tenant_id = ${ctx.tenantId} and p.source_id = ${sourceId} and t.id = p.turn_id
      and t.external_id like ${RESUME_LIKE}`);
  const { ids } = await insertNewTurns(tx, [
    {
      tenantId: ctx.tenantId,
      sourceId,
      externalId: `${RESUME_EXTERNAL_PREFIX}${n}`,
      role: 'document',
      text: texte,
      ts: last.ts,
      captureMode: 'manual',
      acl: [ctx.userId],
    },
  ]);
  if (ids.length === 0) throw new Error('tour de résumé non écrit');
  return createIngestRun(tx, ctx, sourceId, ids, [ctx.userId]);
}

export async function summarizeSession(
  job: ResumeJob,
  deps: { llm: Llm | null },
): Promise<ResumeOutcome> {
  const { llm } = deps;
  if (llm === null) return 'sans-objet';
  const ctx = await resolveTenantContext(job.ownerUserId, job.tenantId);
  // Parti de l'organisation : plus personne sous les droits de qui résumer.
  if (!ctx) return 'sans-objet';
  const read = await withTenant(ctx, (tx) => readSession(tx, ctx, job.sourceId));
  if (read === null) return 'sans-objet';
  if ('reportSeconds' in read) {
    await enqueueResume(job, { fin: false, delaySeconds: read.reportSeconds });
    return 'reporte';
  }
  const condense = condenseSession({ faits: read.condenseFacts, turns: read.turns });
  const answer = await askModel(llm, condense);
  // Sans la marque des tours injectés, seules les PR et les commits prouvent (voir le shortcut en tête).
  const turnIds = new Set(read.turns.map((turn) => turn.id));
  const preuves = new Set([...condense.preuves].filter((id) => !turnIds.has(id)));
  const texte = isNothing(answer) ? null : filterResume(answer, preuves, read.faits);
  const runId = await withTenant(ctx, (tx) => writeResume(tx, ctx, job.sourceId, read.last, texte));
  if (runId === null) return texte === null ? 'rien' : 'sans-objet';
  await enqueueIndexing(ctx, runId);
  return 'ecrit';
}

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer du texte capté (une
// erreur de base cite ses paramètres) ; seulement son résumé (safeErrorSummary).
async function processResumeJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  if (deps.llm === null) return;
  const job = ResumeJobSchema.parse(data);
  try {
    await summarizeSession(job, deps);
  } catch (error) {
    logError('resume.failed', error, { tenantId: job.tenantId, sourceId: job.sourceId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonResumeWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startResumeWorker(deps: { llm: Llm | null }): Promise<void> {
  globalForWorker.leonResumeWorker ??= (async () => {
    const boss = await getResumeBoss();
    await boss.work(
      RESUME_QUEUE,
      { batchSize: 1, localConcurrency: RESUME_CONCURRENCY },
      async ([job]) => processResumeJob(job?.data, deps),
    );
  })().catch((error) => {
    globalForWorker.leonResumeWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonResumeWorker;
}
