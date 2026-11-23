import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { accountIsGone } from '@/server/briefing/briefings';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { brouillons } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { type Llm, LlmError } from '@/server/llm/llm';
import { logError } from '@/server/log';
import { epochToDate } from '@/server/search/filters-sql';
import { EN_SERVICE } from './agents';
import { depositBrouillon } from './brouillon-depot';
import { buildBrouillonPrompt, parseBrouillonAnswer } from './brouillon-prompt';
import { handWritten } from './facts';
import { lockAccount, readFiche } from './fiche';
import { readProposals } from './propositions';
import { MESSAGE, readSentMails, SENT_MAIL_DAYS } from './sent-mails';
import {
  type AnsweredMail,
  readAnsweredMails,
  readWaitingMails,
  WAITING_MAX,
  type WaitingMail,
} from './waiting-mails';

// L'agent « Brouillons de réponse », le premier en service : pour chaque mail qui attend la réponse de la personne
// (waiting-mails.ts), un modèle écrit un brouillon comme elle l'écrirait (brouillon-prompt.ts), gardé dans sa table
// privée (0080) et montré dans Leon. Quand une information ou une décision lui manque, ou que le mail lui demande de
// s'engager, il rend à la place une à trois questions, gardées sur la même ligne sans texte (0082) : Leon l'attend.
// Ses réponses reçues (answerQuestions), un second appel écrit le brouillon en entier, sur cette ligne.
// Un brouillon complet est aussi déposé dans ses brouillons Gmail, en réponse dans le fil (brouillon-depot.ts) : c'est
// tout ce que Leon écrit dans sa boîte. Rien n'est envoyé : l'agent prépare, elle valide. Tout se lit et s'écrit sous
// withTenant de la personne ; l'appel au modèle et le dépôt se font hors de toute transaction. Le worker de la file
// `brouillons-ecrire` lance un passage (brouillons-worker.ts).

// Le plafond de dépense : au plus 20 appels au modèle par personne et par jour (UTC, reserver_brouillon, 0080), un par
// mail, deux quand Leon lui a posé des questions : le premier et le second appel comptent sous le même plafond. Un
// appel lit environ 4 000 jetons (la consigne, quatre messages et trois exemples coupés) et en écrit un millier :
// 2 centimes avec Sonnet, donc 40 centimes par personne et par jour au plus (estimé d'après le tarif de models.ts, pas
// mesuré). Le dépôt dans Gmail suit le même plafond : un brouillon écrit, un dépôt au plus, de deux requêtes, donc
// 40 crédits Pipedream par personne et par jour au plus.
export const BROUILLONS_DAILY_CAP = 20;
// Borne le texte ET la réflexion du modèle (llm.ts) : un brouillon de 6 000 caractères en prend environ 2 000, le reste
// est la marge de la réflexion à l'effort « medium ».
const BROUILLON_MAX_TOKENS = 8000;
const BROUILLON_TIMEOUT_MS = 90_000;

// Un passage : d'abord les brouillons qu'elle attend (elle a répondu aux questions de Leon, le second appel), puis ses
// mails qui attendent (le premier appel), cinq appels au modèle au plus en tout (WAITING_MAX), un par mail. Rend le
// nombre de brouillons écrits. Ne fait rien pour un compte supprimé, ni pour qui n'a pas répondu « oui » à l'agent, ni
// quand il ne lui est plus proposé (sa boîte débranchée). Passé le plafond du jour, il s'arrête.
// Un mail dont la réponse du modèle est illisible, refusée ou coupée n'écrit rien : il attend toujours, et le passage
// suivant le retente, sous le même plafond. Un mail qui a son résultat (un brouillon, des questions, ou « sans
// réponse ») n'est jamais redemandé au modèle, sauf une fois pour écrire le brouillon quand elle a répondu aux
// questions ; et son brouillon n'est déposé qu'ici, une fois, juste après son écriture. Aucun appel pour une demande
// qu'elle a écartée, ni pour un fil qui a bougé depuis (readAnsweredMails).
// Deux passages lancés au même instant appelleraient chacun le modèle pour le même mail, pour une seule ligne écrite :
// la file n'en lance qu'un par personne à la fois (brouillons-queue.ts).
export async function writeBrouillons(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date; fetchImpl?: typeof fetch }, // fetchImpl : tests
): Promise<number> {
  if (await accountIsGone(ctx.userId)) return 0;
  const lines = await readFiche(ctx);
  const proposals = await readProposals(ctx, lines);
  if (!proposals.some((one) => one.agent === EN_SERVICE && one.oui)) return 0;
  const now = deps.now ?? new Date();
  const mails: Array<AnsweredMail | WaitingMail> = [
    ...(await readAnsweredMails(ctx)),
    ...(await readWaitingMails(ctx, now)),
  ].slice(0, WAITING_MAX);
  if (mails.length === 0) return 0;
  const [person] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, ctx.userId));
  // Ses mails écrits de sa main : le brouillon y prend ses exemples.
  const sent = handWritten((await readSentMails(ctx, SENT_MAIL_DAYS, now)).mails);
  let written = 0;
  for (const mail of mails) {
    // Ses réponses aux questions de Leon : le second appel pour ce mail.
    const asked = 'questions' in mail ? mail : undefined;
    const { rows } = await db.execute<{ ok: boolean }>(
      sql`select reserver_brouillon(${ctx.userId}, ${BROUILLONS_DAILY_CAP}) as ok`,
    );
    if (rows[0]?.ok !== true) {
      console.warn('[leon]', 'brouillons.daily_cap', JSON.stringify({ userId: ctx.userId }));
      break;
    }
    const prompt = buildBrouillonPrompt({
      personName: person?.name ?? '',
      mail,
      lines,
      sent,
      asked,
    });
    let answer = '';
    try {
      for await (const delta of deps.llm.streamText({
        step: 'brouillon',
        system: prompt.system,
        messages: prompt.messages,
        maxTokens: BROUILLON_MAX_TOKENS,
        signal: AbortSignal.timeout(BROUILLON_TIMEOUT_MS),
      })) {
        answer += delta;
      }
    } catch (error) {
      // Un refus, une réponse coupée ou une panne : ce mail n'arrête pas les suivants.
      if (!(error instanceof LlmError)) throw error;
      logError('brouillons.call_failed', error, { userId: ctx.userId, sourceId: mail.sourceId });
      continue;
    }
    const result = parseBrouillonAnswer(answer, asked !== undefined);
    // Des identifiants et des nombres seulement, jamais de texte. `brouillon` : écrit (true), pas de brouillon (false :
    // des questions à lui poser, ou aucune réponse à donner), ou réponse illisible (null). `questions` : leur nombre.
    console.info(
      '[leon]',
      'brouillons.answered',
      JSON.stringify({
        userId: ctx.userId,
        sourceId: mail.sourceId,
        brouillon: result && result.texte !== null,
        questions: result?.questions?.length ?? 0,
        chars: answer.length,
      }),
    );
    if (!result) continue;
    // L'appel au modèle dure jusqu'à 90 s : un compte supprimé entre-temps ne reçoit rien (lockAccount), et un
    // résultat déjà écrit pour ce message n'est pas écrasé.
    const kept = await withTenant(ctx, async (tx) => {
      if (!(await lockAccount(tx, ctx))) return undefined;
      if (asked) {
        // Le texte ne se pose que par ecrire_brouillon (0082) : une fois, et pas sur une demande écartée entre-temps.
        const posed = await tx.execute<{ ok: boolean }>(
          sql`select ecrire_brouillon(${asked.id}, ${result.texte}) as ok`,
        );
        return posed.rows[0]?.ok ? asked.id : undefined;
      }
      const [row] = await tx
        .insert(brouillons)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sourceId: mail.sourceId,
          message: mail.message,
          texte: result.texte,
          questions: result.questions,
          acl: [ctx.userId],
        })
        .onConflictDoNothing()
        .returning({ id: brouillons.id });
      return row?.id;
    });
    if (!kept || result.texte === null) continue;
    written += 1;
    // Le destinataire est l'auteur du mail reçu, jamais ce qu'écrit le modèle ni ce qu'elle a répondu. Un dépôt qui
    // échoue n'arrête rien.
    await depositBrouillon(ctx, { id: kept, to: mail.from }, deps);
  }
  return written;
}

// Ce que l'écran montre au plus : les brouillons des mails les plus récents.
// shortcut: au-delà, les plus anciens ne se montrent pas ; à paginer si une personne en garde autant sans les écarter.
const SHOWN_MAX = 20;
// Ce que l'accueil montre au plus : les demandes de Leon sur les mails les plus récents.
const DEMANDES_MAX = 3;

export type ReadyBrouillon = {
  id: string;
  sourceId: string;
  // Le correspondant : son nom, à défaut son adresse.
  from: string | null;
  receivedAt: Date;
  texte: string;
  // Déposé dans ses brouillons Gmail (brouillon-depot.ts) : un oui ou un non, jamais l'identifiant du brouillon Gmail.
  depose: boolean;
};
// Une demande de Leon : les questions qu'il lui pose avant d'écrire le brouillon, et auxquelles elle n'a pas répondu.
export type Demande = Pick<ReadyBrouillon, 'id' | 'sourceId' | 'from' | 'receivedAt'> & {
  questions: string[];
};

// Ses lignes dans l'état `state`, le mail le plus récent d'abord : celles qu'elle n'a pas écartées, et dont le fil n'a
// pas bougé depuis. Le dernier message du fil se relit à chaque affichage : dès qu'elle a répondu, ou qu'un nouveau
// message est arrivé, la ligne ne se montre plus. À date égale, le même départage que readWaitingMails.
async function shownRows(ctx: TenantContext, state: SQL, limit: number) {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{
      id: string;
      sourceId: string;
      from: string | null;
      at: string;
      texte: string | null;
      depose: boolean;
      questions: string[] | null;
    }>(sql`
      select b.id, b.source_id as "sourceId", coalesce(l.author_name, l.author_email) as "from",
             extract(epoch from l.ts) as at, b.texte, b.brouillon_gmail is not null as depose, b.questions
      from brouillons b
      cross join lateral (
        select t.external_id, t.author_name, t.author_email, t.ts
        from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
        order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
        limit 1
      ) l
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId}
        and b.ecarte_le is null and ${state}
        and substring(l.external_id from ${MESSAGE}) = b.message
      order by l.ts desc, b.id
      limit ${limit}`),
  );
  return rows.map(({ at, ...row }) => ({ ...row, receivedAt: epochToDate(at) }));
}

// Ses brouillons prêts, pour « Ma fiche » : ceux qui ont leur texte, écrit au premier appel ou avec ses réponses.
export async function readBrouillons(ctx: TenantContext): Promise<ReadyBrouillon[]> {
  const rows = await shownRows(ctx, sql`b.texte is not null`, SHOWN_MAX);
  return rows.flatMap(({ questions: _, texte, ...row }) =>
    texte === null ? [] : [{ ...row, texte }],
  );
}

// Les demandes de Leon qui l'attendent, pour l'accueil : des questions, pas encore de réponses.
export async function readDemandes(ctx: TenantContext): Promise<Demande[]> {
  const rows = await shownRows(
    ctx,
    sql`b.texte is null and b.questions is not null and b.reponses is null`,
    DEMANDES_MAX,
  );
  return rows.flatMap(({ id, sourceId, from, receivedAt, questions }) =>
    questions ? [{ id, sourceId, from, receivedAt, questions }] : [],
  );
}

// Ses réponses aux questions de Leon, une par question, dans le même ordre (une réponse peut être vide) : gardées sur
// la ligne, et le passage suivant écrira le brouillon. Rend false, sans rien écrire, si la demande n'est pas à elle,
// n'est plus ouverte (déjà répondue, écartée, sans question, ou son brouillon déjà écrit), ou si le nombre de réponses
// n'est pas celui des questions. Deux envois simultanés n'en gardent qu'un : le second attend le premier, relit la
// ligne, et ne la trouve plus ouverte. L'appelant a borné les réponses (settings/actions.ts) ; la table aussi (0082).
export async function answerQuestions(
  ctx: TenantContext,
  id: string,
  reponses: string[],
): Promise<boolean> {
  if (!z.uuid().safeParse(id).success) return false;
  const answered = await withTenant(ctx, (tx) =>
    tx
      .update(brouillons)
      .set({ reponses })
      .where(
        and(
          eq(brouillons.tenantId, ctx.tenantId),
          eq(brouillons.userId, ctx.userId),
          eq(brouillons.id, id),
          isNull(brouillons.texte),
          isNull(brouillons.reponses),
          isNull(brouillons.ecarteLe),
          sql`cardinality(${brouillons.questions}) = ${reponses.length}`,
        ),
      )
      .returning({ id: brouillons.id }),
  );
  return answered.length > 0;
}

// L'écarte : il ne se montre plus, et son mail reste traité (aucun autre brouillon ne lui sera écrit). Une demande de
// Leon s'écarte de même, et se clôt : ses questions ne sont plus posées, et aucun autre appel n'est fait pour ce mail.
// Rend false s'il
// n'est pas à la personne, ou déjà écarté. Celui que Leon avait déposé dans ses brouillons Gmail en est retiré ensuite,
// hors d'ici (brouillon-depot.ts, withdrawBrouillon).
export async function discardBrouillon(ctx: TenantContext, id: string): Promise<boolean> {
  if (!z.uuid().safeParse(id).success) return false;
  const discarded = await withTenant(ctx, (tx) =>
    tx
      .update(brouillons)
      .set({ ecarteLe: sql`now()` })
      .where(
        and(
          eq(brouillons.tenantId, ctx.tenantId),
          eq(brouillons.userId, ctx.userId),
          eq(brouillons.id, id),
          isNull(brouillons.ecarteLe),
        ),
      )
      .returning({ id: brouillons.id }),
  );
  return discarded.length > 0;
}
