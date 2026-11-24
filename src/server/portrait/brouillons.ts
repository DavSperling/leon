import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { accountIsGone } from '@/server/briefing/briefings';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { brouillons } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { type Llm, LlmError } from '@/server/llm/llm';
import { logError } from '@/server/log';
import { epochToDate, textArray } from '@/server/search/filters-sql';
import type { AgentId } from './agents';
import { depositBrouillon } from './brouillon-depot';
import {
  BROUILLON_MAX_CHARS,
  buildBrouillonPrompt,
  parseBrouillonAnswer,
} from './brouillon-prompt';
import { handWritten } from './facts';
import { lockAccount, readFiche } from './fiche';
import { ownText } from './own-text';
import { buildPreferencePrompt, parsePreferenceAnswer } from './preference-prompt';
import {
  compareReplies,
  keepRetouche,
  PREFERENCES_MAX,
  type Reply,
  readPreferences,
} from './preferences';
import { readProposals } from './propositions';
import { MESSAGE, readSentMails, SENT_MAIL_DAYS } from './sent-mails';
import {
  ANSWERED_DAYS,
  type AnsweredMail,
  readAnsweredMails,
  readWaitingMails,
  unknownMails,
  WAITING_MAX,
  type WaitingMail,
} from './waiting-mails';

// L'agent « Brouillons de réponse », le premier en service : pour chaque mail qui attend la réponse de la personne
// (waiting-mails.ts), un modèle écrit un brouillon comme elle l'écrirait (brouillon-prompt.ts), gardé dans sa table
// privée (0080) et montré dans le panneau de l'accueil de Leon (readShown). Quand une information ou une décision lui manque, ou que le mail lui demande de
// s'engager, il rend à la place une à trois questions, chacune avec ses choix de réponse, gardées sur la même ligne
// sans texte (0082, 0083) : Leon l'attend. Ses réponses reçues (answerQuestions), un second appel écrit le brouillon en
// entier, sur cette ligne.
// Le mail d'un inconnu ne part pas au modèle avant qu'elle l'ait demandé : l'accueil lui demande si elle veut une
// réponse (answerUnknownMail), et son « oui », avec ses indications, fait faire le premier appel au passage suivant,
// sur la ligne de son oui (0084). La suite est celle de tous les brouillons.
// Un brouillon complet est aussi déposé dans ses brouillons Gmail, en réponse dans le fil (brouillon-depot.ts) : c'est
// tout ce que Leon écrit dans sa boîte. Rien n'est envoyé : l'agent prépare, elle valide. Tout se lit et s'écrit sous
// withTenant de la personne ; l'appel au modèle et le dépôt se font hors de toute transaction. Le worker de la file
// `brouillons-ecrire` lance un passage (brouillons-worker.ts).

// Le plafond de dépense : au plus 20 appels au modèle par personne et par jour (UTC, reserver_brouillon, 0080), un par
// mail, deux quand Leon lui a posé des questions : le premier et le second appel comptent sous le même plafond, comme
// l'appel qui tire une préférence d'une retouche (learnFrom), plus court. Un
// appel lit environ 4 000 jetons (la consigne, quatre messages et trois exemples coupés) et en écrit un millier :
// 2 centimes avec Sonnet, donc 40 centimes par personne et par jour au plus (estimé d'après le tarif de models.ts, pas
// mesuré). Le dépôt dans Gmail suit le même plafond : un brouillon écrit, un dépôt au plus, de deux requêtes, donc
// 40 crédits Pipedream par personne et par jour au plus.
export const BROUILLONS_DAILY_CAP = 20;
// Borne le texte ET la réflexion du modèle (llm.ts) : un brouillon de 6 000 caractères en prend environ 2 000, le reste
// est la marge de la réflexion à l'effort « medium ».
const BROUILLON_MAX_TOKENS = 8000;
const BROUILLON_TIMEOUT_MS = 90_000;
// La préférence tirée d'une retouche, une phrase : la réponse entière, réflexion comprise, est bornée ici.
const PREFERENCE_MAX_TOKENS = 4000;

// Un passage : en tête, sans modèle, ses réponses envoyées aux brouillons de Leon se comparent à eux (preferences.ts) ;
// puis les brouillons qu'elle attend (elle a répondu aux questions de Leon, le second appel ; ou dit
// « Oui » au mail d'un inconnu, son premier appel, avec ses indications), puis ses mails qui attendent (le premier
// appel), puis les leçons de ses retouches (learnFrom), cinq appels au modèle au plus en tout (WAITING_MAX), un par
// mail ou par retouche. Rend le nombre de brouillons écrits. Ne fait rien pour un compte supprimé. Chaque agent en
// service ne travaille que pour qui lui a dit « oui », à lui, tant qu'il lui est proposé (sa boîte branchée) : ses mails
// qui attendent et ses retouches pour « Brouillons de réponse », ses relances pour « Relances » ; le même passage, sous
// le même plafond, pour les deux. Passé le plafond du jour, il s'arrête.
// Un mail dont la réponse du modèle est illisible, refusée ou coupée n'écrit rien : il attend toujours, et le passage
// suivant le retente, sous le même plafond. Un mail qui a son résultat (un brouillon, des questions, ou « sans
// réponse ») n'est jamais redemandé au modèle, sauf une fois pour écrire le brouillon quand elle a répondu aux
// questions ; et son brouillon n'est déposé qu'ici, une fois, juste après son écriture. Aucun appel pour une demande
// qu'elle a écartée, ni pour un fil qui a bougé depuis, ni pour un mail de plus de ANSWERED_DAYS jours
// (readAnsweredMails). Aucun pour le mail d'un inconnu avant son oui : il n'est jamais parmi ses mails qui attendent.
// Deux passages lancés au même instant appelleraient chacun le modèle pour le même mail, pour une seule ligne écrite :
// la file n'en lance qu'un par personne à la fois (brouillons-queue.ts).
export async function writeBrouillons(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date; fetchImpl?: typeof fetch }, // fetchImpl : tests
): Promise<number> {
  if (await accountIsGone(ctx.userId)) return 0;
  const lines = await readFiche(ctx);
  const proposals = await readProposals(ctx, lines);
  const oui = (agent: AgentId) => proposals.some((one) => one.agent === agent && one.oui);
  const reponses = oui('brouillon-reponse');
  const relances = oui('relance');
  if (!reponses && !relances) return 0;
  const now = deps.now ?? new Date();
  // En tête : ses réponses envoyées depuis le dernier passage, comparées aux brouillons de Leon (preferences.ts).
  const retouches = reponses ? await compareReplies(ctx, now) : [];
  const sortes = (['reponse', 'relance'] as const).filter((sorte) =>
    sorte === 'reponse' ? reponses : relances,
  );
  const mails: Array<AnsweredMail | WaitingMail> = [
    ...(await readAnsweredMails(ctx, sortes)),
    ...(reponses ? await readWaitingMails(ctx, now) : []),
  ].slice(0, WAITING_MAX);
  if (mails.length === 0 && retouches.length === 0) return 0;
  const [person] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, ctx.userId));
  // Ses mails écrits de sa main : le brouillon y prend ses exemples. Sans mail à préparer, rien à lire.
  const sent =
    mails.length === 0 ? [] : handWritten((await readSentMails(ctx, SENT_MAIL_DAYS, now)).mails);
  let written = 0;
  for (const mail of mails) {
    // Ce qu'elle attend : ses réponses aux questions de Leon, le second appel pour ce mail ; ou son oui au mail d'un
    // inconnu, avec ses indications, le premier.
    const owed = 'id' in mail ? mail : undefined;
    const asked =
      owed?.questions && owed.reponses
        ? { questions: owed.questions, reponses: owed.reponses }
        : undefined;
    if (!(await reserve(ctx))) return written;
    const prompt = buildBrouillonPrompt({
      personName: person?.name ?? '',
      mail,
      lines,
      sent,
      asked,
      indications: owed?.indications ?? undefined,
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
      if (owed) {
        // Sur sa ligne, le résultat ne se pose que par ecrire_brouillon (0082) ou ecrire_inconnu (0084) : une fois, et
        // pas sur une demande écartée entre-temps.
        const posed = await tx.execute<{ ok: boolean }>(
          asked
            ? sql`select ecrire_brouillon(${owed.id}, ${result.texte}) as ok`
            : sql`select ecrire_inconnu(${owed.id}, ${result.texte},
                    ${result.questions ? textArray(result.questions) : sql`null`}::text[],
                    ${result.choix && JSON.stringify(result.choix)}::jsonb) as ok`,
        );
        return posed.rows[0]?.ok ? owed.id : undefined;
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
          choix: result.choix,
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
  await learnFrom(ctx, retouches, WAITING_MAX - mails.length, deps.llm);
  return written;
}

// Un appel au modèle de plus aujourd'hui, s'il en reste sous le plafond du jour (reserver_brouillon, 0080).
async function reserve(ctx: TenantContext): Promise<boolean> {
  const { rows } = await db.execute<{ ok: boolean }>(
    sql`select reserver_brouillon(${ctx.userId}, ${BROUILLONS_DAILY_CAP}) as ok`,
  );
  if (rows[0]?.ok === true) return true;
  console.warn('[leon]', 'brouillons.daily_cap', JSON.stringify({ userId: ctx.userId }));
  return false;
}

// Les leçons de ses retouches (preferences.ts), après ses mails, dans les `calls` appels qui restent au passage : un
// appel par brouillon retouché, sous le même plafond du jour, qui lit le brouillon, ce qu'elle a envoyé (own-text.ts,
// coupé comme un brouillon) et toutes ses préférences déjà tirées (preference-prompt.ts). La préférence qu'il rend est
// proposée dans sa fiche ; elle ne sert qu'après son oui. « Rien à retenir », ou une préférence déjà tirée mot pour mot,
// pose l'issue sans rien proposer. Une réponse illisible, refusée ou coupée n'écrit rien : la retouche se recompare et
// se retente au passage suivant, tant que son mail a moins de ANSWERED_DAYS jours. Avec PREFERENCES_MAX préférences
// proposées ou acceptées, plus aucun appel : l'issue se pose seule. Un passage à la fois par personne
// (brouillons-queue.ts) : deux appels ne se font jamais pour la même retouche.
async function learnFrom(ctx: TenantContext, retouches: Reply[], calls: number, llm: Llm) {
  if (retouches.length === 0) return;
  const known = await readPreferences(ctx);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  let room = PREFERENCES_MAX - known.filter((one) => one.etat !== 'refusee').length;
  for (const reply of retouches) {
    let preference: string | null = null;
    if (room > 0) {
      if (calls === 0 || !(await reserve(ctx))) return;
      calls -= 1;
      const prompt = buildPreferencePrompt({
        brouillon: reply.texte,
        envoye: ownText(reply.envoye).text.slice(0, BROUILLON_MAX_CHARS).toWellFormed(),
        preferences: known,
      });
      let answer = '';
      try {
        for await (const delta of llm.streamText({
          step: 'brouillon',
          system: prompt.system,
          messages: prompt.messages,
          maxTokens: PREFERENCE_MAX_TOKENS,
          signal: AbortSignal.timeout(BROUILLON_TIMEOUT_MS),
        })) {
          answer += delta;
        }
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        logError('brouillons.preference_failed', error, {
          userId: ctx.userId,
          brouillonId: reply.id,
        });
        continue;
      }
      const result = parsePreferenceAnswer(answer);
      // Des identifiants et des nombres seulement. `preference` : proposée (true), rien à retenir (false), ou réponse
      // illisible (null).
      console.info(
        '[leon]',
        'brouillons.preference',
        JSON.stringify({
          userId: ctx.userId,
          brouillonId: reply.id,
          preference: result && result.preference !== null,
          chars: answer.length,
        }),
      );
      if (!result) continue;
      const found = result.preference;
      preference = found && !known.some((one) => same(one.texte, found)) ? found : null;
    }
    if ((await keepRetouche(ctx, reply.id, preference)) && preference) {
      known.push({ texte: preference, etat: 'proposee' });
      room -= 1;
    }
  }
}

// Ce que l'accueil lit au plus pour le panneau de l'agent, de chaque sorte (les demandes de Leon, avec les mails
// d'inconnus, et les brouillons prêts) : les mails les plus récents.
export const HOME_MAX = 20;

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
// Une demande de Leon : les questions qu'il lui pose avant d'écrire le brouillon, chacune avec ses choix de réponse,
// dans le même ordre (aucun pour une demande posée avant les choix, 0083). `repondue` : elle a répondu, et Leon écrit
// le brouillon. Son oui au mail d'un inconnu, tant que le premier appel n'a rien rendu, en est une sans question, où
// Leon écrit.
export type Demande = Pick<ReadyBrouillon, 'id' | 'sourceId' | 'from' | 'receivedAt'> & {
  questions: string[];
  choix: string[][];
  repondue: boolean;
};

// Ce que l'accueil montre de l'agent, d'une seule lecture : les demandes de Leon (ses questions, qu'elle y ait répondu
// ou non, et son oui au mail d'un inconnu, tant que le brouillon n'est pas écrit) et les brouillons prêts (ceux qui ont leur texte, écrit au premier
// appel ou avec ses réponses), HOME_MAX de chaque sorte, le mail le plus récent d'abord. Seulement les lignes qu'elle
// n'a pas écartées, et dont le fil n'a pas bougé depuis : le dernier message du fil se relit à chaque affichage, et dès
// qu'elle a répondu, ou qu'un nouveau message est arrivé, la ligne ne se montre plus. À date égale, le même départage
// que readWaitingMails. Et pas la demande d'un mail trop ancien pour un appel (readAnsweredMails) : ses réponses, ou
// son oui, ne feraient plus rien écrire. Parmi les demandes, celles qui attendent sa réponse passent avant celles où Leon
// écrit : elles seules attendent un geste d'elle, et des lignes « Leon écrit » ne doivent pas les cacher.
// Un mail jugé sans réponse à donner, ou son « non » à un inconnu (ni texte, ni question, ni oui), s'écarte sur sa
// ligne seule, avant de chercher le dernier message de son fil : ces lignes ne se montrent jamais, et leur nombre ne
// fait que grandir.
// shortcut: au-delà de HOME_MAX, les plus anciens ne se montrent pas ; à paginer si une personne en garde autant sans
// les écarter.
export async function readShown(
  ctx: TenantContext,
): Promise<{ demandes: Demande[]; prets: ReadyBrouillon[] }> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{
      id: string;
      sourceId: string;
      from: string | null;
      at: string;
      texte: string | null;
      depose: boolean;
      questions: string[] | null;
      choix: string[][] | null;
      repondue: boolean;
    }>(sql`
      select id, "sourceId", "from", at, texte, depose, questions, choix, repondue from (
        select b.id, b.source_id as "sourceId", coalesce(l.author_name, l.author_email) as "from",
               extract(epoch from l.ts) as at, b.texte, b.brouillon_gmail is not null as depose,
               b.questions, b.choix, (b.reponses is not null or b.questions is null) as repondue,
               -- Leon écrit (repondue) : vrai aussi de tout brouillon prêt, ce qui ne change pas leur ordre.
               row_number() over (
                 partition by b.texte is null
                 order by (b.reponses is not null or b.questions is null), l.ts desc, b.id
               ) as n
        from brouillons b
        cross join lateral (
          select t.external_id, t.author_name, t.author_email, t.ts
          from turns t
          where t.tenant_id = b.tenant_id and t.source_id = b.source_id
          order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
          limit 1
        ) l
        where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId}
          and b.ecarte_le is null
          -- envoyé depuis l'accueil (0088) : la ligne s'en va aussitôt, sans attendre la relève
          and b.envoye_le is null
          and (b.texte is not null or b.questions is not null or b.indications is not null)
          and substring(l.external_id from ${MESSAGE}) = b.message
          and (b.texte is not null or l.ts >= now() - make_interval(days => ${ANSWERED_DAYS}))
      ) shown
      where n <= ${HOME_MAX}
      order by at desc, id`),
  );
  const demandes: Demande[] = [];
  const prets: ReadyBrouillon[] = [];
  for (const { at, texte, depose, questions, choix, repondue, ...row } of rows) {
    const one = { ...row, receivedAt: epochToDate(at) };
    const asked = questions ?? [];
    if (texte !== null) prets.push({ ...one, texte, depose });
    else demandes.push({ ...one, questions: asked, choix: choix ?? asked.map(() => []), repondue });
  }
  return { demandes, prets };
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

// Sa réponse au mail d'un inconnu (waiting-mails.ts, unknownMails), depuis l'accueil : « Oui », avec ses indications
// (vides quand elle n'en donne pas), ou « Non » (null). Une ligne s'écrit pour ce mail (0084) : son oui attend le
// passage suivant, qui fera le premier appel ; son non le ferme pour de bon, sans appel. Rend l'identifiant de la ligne,
// ou null sans rien écrire si ce n'est pas un mail d'inconnu qui l'attend encore : à elle, pas encore traité, toujours
// le dernier de son fil, de moins de sept jours ; ou si son compte est supprimé. Deux envois simultanés n'en gardent
// qu'un : une seule ligne par message (0080). L'appelant a borné les indications (settings/actions.ts) ; la table aussi.
export async function answerUnknownMail(
  ctx: TenantContext,
  mail: { sourceId: string; message: string },
  indications: string | null,
): Promise<string | null> {
  if (!z.uuid().safeParse(mail.sourceId).success) return null;
  const line = sql`s.tenant_id, ${ctx.userId}::uuid, s.id, l.message, ${indications}::text,
                   array[${ctx.userId}::uuid]`;
  return withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return null;
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into brouillons (tenant_id, user_id, source_id, message, indications, acl)
      ${unknownMails(ctx, new Date(), line, mail)}
      on conflict do nothing
      returning id`);
    return rows[0]?.id ?? null;
  });
}

// L'écarte : il ne se montre plus, et son mail reste traité (aucun autre brouillon ne lui sera écrit). Une demande de
// Leon s'écarte de même, et se clôt : ses questions ne sont plus posées, et aucun autre appel n'est fait pour ce mail.
// Rend false s'il n'est pas à la personne, ou déjà écarté. Celui que Leon avait déposé dans ses brouillons Gmail en est
// retiré ensuite, hors d'ici (brouillon-depot.ts, withdrawBrouillon).
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
