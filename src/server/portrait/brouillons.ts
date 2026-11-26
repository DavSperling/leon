import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { accountIsGone } from '@/server/briefing/briefings';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { brouillons } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { isUnreachable, type Llm, LlmError } from '@/server/llm/llm';
import { logError } from '@/server/log';
import { epochToDate, textArray } from '@/server/search/filters-sql';
import type { AgentId } from './agents';
import { depositBrouillon, withdrawRelances } from './brouillon-depot';
import {
  BROUILLON_MAX_CHARS,
  type BrouillonAnswer,
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
import { MESSAGE, ownAddresses, readSentMails, SENT_MAIL_DAYS } from './sent-mails';
import { buildTriPrompt, parseTriAnswer } from './tri-prompt';
import { recipientName, relanceRecipients, unansweredMails } from './unanswered-mails';
import {
  ANSWERED_DAYS,
  type AnsweredMail,
  readAnsweredMails,
  readWaitingMails,
  WAITING_MAX,
  type WaitingMail,
} from './waiting-mails';

// L'agent « Brouillons de réponse », le premier en service : pour chaque mail qui attend la réponse de la personne
// (waiting-mails.ts), un modèle écrit un brouillon comme elle l'écrirait (brouillon-prompt.ts), gardé dans sa table
// privée (0080) et montré dans le panneau de l'accueil de Leon (readShown). Quand une information ou une décision lui manque, ou que le mail lui demande de
// s'engager, il rend à la place une à trois questions, chacune avec ses choix de réponse, gardées sur la même ligne
// sans texte (0082, 0083) : Leon l'attend. Ses réponses reçues (answerQuestions), un second appel écrit le brouillon en
// entier, sur cette ligne.
// Le mail d'un inconnu se lit comme celui d'un correspondant, dès que la relève le dit « pas automatique »
// (waiting-mails.ts) : c'est le modèle qui juge si une réponse est attendue. Une ligne d'avant, son « oui » au mail d'un
// inconnu avec ses indications (0084), se traite toujours, par le chemin d'une relance. Un mail jugé sans réponse à
// donner y revient quand elle demande quand même une réponse (sans-reponse.ts) : sa ligne porte alors ses indications,
// et « sans réponse » ne se lit plus.
// Avant ce premier appel, un tri (sortMail, tri-prompt.ts) : un petit modèle lit le fil seul et dit si le mail attend
// une réponse. Sinon, le mail garde la même ligne qu'un « sans réponse » du premier appel, qui n'a pas lieu. Le tri ne
// passe que sur un mail reçu que rien n'a encore lu, jamais sur ce qu'elle a demandé (ses réponses, son oui).
// L'agent « Relances » demande d'abord, dans le même passage : l'accueil lui demande, pour chacun de ses mails restés
// sans réponse (unanswered-mails.ts), si elle veut une relance (answerRelance) ; son « oui », avec ses indications, fait
// faire le premier appel au passage suivant, avec la consigne d'une relance (brouillon-prompt.ts), sur une ligne de
// sorte « relance » (0089). Aucun modèle ne lit ce mail avant son oui.
// Un brouillon complet, réponse ou relance, est aussi déposé dans ses brouillons Gmail, en réponse dans le fil
// (brouillon-depot.ts) : c'est tout ce que Leon écrit dans sa boîte. Rien ne part sans son geste : l'agent prépare, elle
// valide. Tout se lit et s'écrit sous withTenant de la personne ; l'appel au modèle et le dépôt se font hors de toute
// transaction. Le worker de la file `brouillons-ecrire` lance un passage (brouillons-worker.ts).

// Le plafond de dépense : au plus 20 appels au modèle par personne et par jour (UTC, reserver_brouillon, 0080), un par
// mail, deux quand Leon lui a posé des questions : le premier et le second appel comptent sous le même plafond, comme
// l'appel qui tire une préférence d'une retouche (learnFrom), plus court. Un
// appel lit environ 4 000 jetons (la consigne, quatre messages et trois exemples coupés) et en écrit un millier :
// 2 centimes avec Sonnet, donc 40 centimes par personne et par jour au plus (estimé d'après le tarif de models.ts, pas
// mesuré). Le tri qui précède le premier appel lit le fil seul, 2 000 jetons au plus, et écrit une ligne : moins de
// 0,05 centime avec Haiku (estimé de même). Il ne compte pas sous le plafond, qui reste celui des appels du brouillon :
// l'appel réservé est rendu quand le tri dit « sans réponse ». Le dépôt dans Gmail suit le même plafond : un brouillon
// écrit, un dépôt au plus, de deux requêtes, donc 40 crédits Pipedream par personne et par jour au plus ; et une relance
// déposée en coûte un de plus si son fil bouge avant qu'elle l'envoie (withdrawRelances).
export const BROUILLONS_DAILY_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
// Borne le texte ET la réflexion du modèle (llm.ts) : un brouillon de 6 000 caractères en prend environ 2 000, le reste
// est la marge de la réflexion à l'effort « medium ».
const BROUILLON_MAX_TOKENS = 8000;
const BROUILLON_TIMEOUT_MS = 90_000;
// La préférence tirée d'une retouche, une phrase : la réponse entière, réflexion comprise, est bornée ici.
const PREFERENCE_MAX_TOKENS = 4000;
// Le verdict du tri, une ligne de quinze jetons : le reste est la marge de la réflexion du petit modèle, à l'effort
// « low ».
const TRI_MAX_TOKENS = 2000;
const TRI_TIMEOUT_MS = 30_000;
// Ce que rend le premier appel pour un mail sans réponse à donner : la ligne que le tri écrit à sa place.
const SANS_REPONSE: BrouillonAnswer = { texte: null, questions: null, choix: null };

// Un appel raté (réponse illisible, refus, coupure) se retente au passage suivant, une fois. Après deux ratés de
// suite, le mail (ou la retouche) attend RETRY_MS avant chaque nouvel essai : un passage suit chaque relève de sa
// boîte, et sans cela un seul mail que le modèle ne sait pas traiter prenait les vingt appels du jour, donc les
// brouillons de tous ses autres mails. Un appel réussi l'oublie. Un fournisseur injoignable n'est pas un raté du
// mail : l'appel est rendu (giveBack) et le passage s'arrête, la relève suivante le reprend.
// shortcut: gardé dans ce processus (un redéploiement l'oublie, et le mail se retente deux fois) ; une colonne en base
// si les passages se font un jour dans plusieurs processus.
const RETRY_MS = DAY_MS;
const misses = new Map<string, { n: number; at: number }>();
const miss = (key: string, now: Date) =>
  misses.set(key, { n: (misses.get(key)?.n ?? 0) + 1, at: now.getTime() });
const rests = (key: string, now: Date) => {
  const one = misses.get(key);
  return one !== undefined && one.n >= 2 && now.getTime() - one.at < RETRY_MS;
};
const mailKey = (ctx: TenantContext, mail: { sourceId: string; message: string }) =>
  `${ctx.userId}|${mail.sourceId}|${mail.message}`;
// Ses mails laissés de côté à cet instant, « <fil>|<message> » (waiting-mails.ts).
function restingMails(ctx: TenantContext, now: Date): string[] {
  const mine = `${ctx.userId}|`;
  return [...misses.keys()]
    .filter((key) => key.startsWith(mine) && rests(key, now))
    .map((key) => key.slice(mine.length));
}

// Un passage : en tête, sans modèle, ses relances déposées dont le fil a bougé quittent Gmail (withdrawRelances : il ne
// fait que défaire ce que Leon a écrit, quel que soit l'agent auquel elle dit oui), et ses réponses envoyées aux
// brouillons de Leon se comparent à eux (preferences.ts) ; puis les brouillons qu'elle attend (elle a répondu aux
// questions de Leon, le second appel ; ou dit « Oui » à une relance, son premier appel, avec ses indications),
// puis ses mails qui attendent (le tri, puis le premier appel de ceux qui attendent une réponse), puis les leçons de
// ses retouches (learnFrom), cinq mails ou retouches au plus en tout (WAITING_MAX), un appel du brouillon chacun au
// plus, précédé d'un tri pour un mail reçu. Rend le nombre de brouillons écrits. Ne fait rien pour un
// compte supprimé. Chaque agent en service ne travaille que pour qui lui a dit « oui », à lui, tant qu'il lui est
// proposé (sa boîte branchée) : ses mails qui attendent et ses retouches pour « Brouillons de réponse », ses relances
// pour « Relances » ; le même passage, sous le même plafond, pour les deux. Passé le plafond du jour, il s'arrête.
// Un mail dont la réponse du modèle est illisible, refusée ou coupée n'écrit rien : il attend toujours, et le passage
// suivant le retente, sous le même plafond ; après deux ratés de suite, un jour plus tard seulement (RETRY_MS). Un mail qui a son résultat (un brouillon, des questions, ou « sans
// réponse ») n'est jamais redemandé au modèle, sauf une fois pour écrire le brouillon quand elle a répondu aux
// questions ; et son brouillon n'est déposé qu'ici, une fois, juste après son écriture. Aucun appel pour une demande
// qu'elle a écartée, ni pour un fil qui a bougé depuis, ni pour un mail de plus de ANSWERED_DAYS jours
// (readAnsweredMails). Aucun pour son mail resté sans réponse avant son oui à une relance : seule sa ligne le fait
// lire. Une relance a sa
// consigne, et « sans réponse » y est illisible : elle l'a demandée.
// Deux passages lancés au même instant appelleraient chacun le modèle pour le même mail, pour une seule ligne écrite :
// la file n'en lance qu'un par personne à la fois (brouillons-queue.ts).
export async function writeBrouillons(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date; fetchImpl?: typeof fetch }, // fetchImpl : tests
): Promise<number> {
  if (await accountIsGone(ctx.userId)) return 0;
  // D'abord, sans modèle et quel que soit le plafond : ses relances déposées dont le fil a bougé quittent Gmail.
  await withdrawRelances(ctx, deps);
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
  const resting = restingMails(ctx, now);
  const mails: Array<AnsweredMail | WaitingMail> = [
    ...(await readAnsweredMails(ctx, sortes, resting)),
    ...(reponses ? await readWaitingMails(ctx, now, resting) : []),
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
    // Ce qu'elle attend : ses réponses aux questions de Leon, le second appel pour ce mail ; ou son oui à une
    // relance, avec ses indications, le premier.
    const owed = 'id' in mail ? mail : undefined;
    // Une relance : depuis combien de jours son mail, le dernier du fil, attend une réponse.
    const last = mail.messages.at(-1)?.at ?? now;
    const relance =
      owed?.sorte === 'relance'
        ? { jours: Math.floor((now.getTime() - last.getTime()) / DAY_MS) }
        : undefined;
    const asked =
      owed?.questions && owed.reponses
        ? { questions: owed.questions, reponses: owed.reponses }
        : undefined;
    // Son oui à ce mail (« Préparer une réponse », sans-reponse.ts ; avant, au mail d'un inconnu) : elle a demandé la
    // réponse, la consigne ne propose plus « sans réponse », qui ne se lit plus.
    const voulue = owed?.sorte === 'reponse' && owed.indications !== null;
    if (!(await reserve(ctx))) return written;
    // Un mail reçu que rien n'a encore lu passe d'abord par le tri ; ce qu'elle a demandé s'écrit sans lui.
    const expected = owed ? true : await sortMail(ctx, deps.llm, person?.name ?? '', mail);
    if (expected === 'injoignable') {
      await giveBack(ctx);
      return written;
    }
    let read: BrouillonAnswer | null;
    if (!expected) {
      // Aucune réponse attendue : l'appel du brouillon n'a pas lieu, celui qui était réservé est rendu.
      await giveBack(ctx);
      read = SANS_REPONSE;
    } else {
      const prompt = buildBrouillonPrompt({
        personName: person?.name ?? '',
        mail,
        lines,
        // Une relance ne prend pas ses exemples dans son fil : son mail y est déjà, à relancer, pas à imiter.
        sent: relance ? sent.filter((one) => one.sourceId !== mail.sourceId) : sent,
        asked,
        indications: owed?.indications ?? undefined,
        relance,
        voulue,
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
        // Un refus ou une réponse coupée : ce mail n'arrête pas les suivants.
        if (!(error instanceof LlmError)) throw error;
        logError('brouillons.call_failed', error, { userId: ctx.userId, sourceId: mail.sourceId });
        if (isUnreachable(error)) {
          await giveBack(ctx);
          return written;
        }
        miss(mailKey(ctx, mail), now);
        continue;
      }
      read = parseBrouillonAnswer(answer, asked !== undefined, relance !== undefined || voulue);
      // Des identifiants et des nombres seulement, jamais de texte. `brouillon` : écrit (true), pas de brouillon
      // (false : des questions à lui poser, ou aucune réponse à donner), ou réponse illisible (null). `questions` : leur
      // nombre.
      console.info(
        '[leon]',
        'brouillons.answered',
        JSON.stringify({
          userId: ctx.userId,
          sourceId: mail.sourceId,
          brouillon: read && read.texte !== null,
          questions: read?.questions?.length ?? 0,
          chars: answer.length,
        }),
      );
      if (!read) {
        miss(mailKey(ctx, mail), now);
        continue;
      }
    }
    const result = read;
    misses.delete(mailKey(ctx, mail));
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
    // Les destinataires se fixent au dépôt, d'après le mail : jamais ce qu'écrit le modèle ni ce qu'elle a répondu. Un
    // dépôt qui échoue n'arrête rien.
    await depositBrouillon(ctx, kept, deps);
  }
  await learnFrom(ctx, retouches, WAITING_MAX - mails.length, deps.llm, now);
  return written;
}

// Le tri d'un mail reçu, avant l'appel de son brouillon (tri-prompt.ts) : une réponse est-elle attendue ? Un tri
// illisible, refusé ou coupé vaut un oui : le brouillon s'écrit alors comme sans tri, et aucun mail n'est écarté par
// un raté du tri. 'injoignable' : le fournisseur ne répond pas, et le passage s'arrête comme pour l'appel du brouillon.
// shortcut: le tri n'a pas de plafond à lui. Il suit l'appel réservé du brouillon (un tri par mail qui attend, cinq
// par passage, aucun au plafond du jour), et un mail trié « sans réponse » a sa ligne, donc n'est jamais retrié : sa
// dépense suit le nombre de mails reçus. Un compteur à lui si une boîte reçoit des milliers de mails non automatiques
// par jour.
async function sortMail(
  ctx: TenantContext,
  llm: Llm,
  personName: string,
  mail: WaitingMail,
): Promise<boolean | 'injoignable'> {
  const prompt = buildTriPrompt({ personName, mail });
  let answer = '';
  try {
    for await (const delta of llm.streamText({
      step: 'tri',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: TRI_MAX_TOKENS,
      signal: AbortSignal.timeout(TRI_TIMEOUT_MS),
    })) {
      answer += delta;
    }
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    logError('brouillons.sort_failed', error, { userId: ctx.userId, sourceId: mail.sourceId });
    if (isUnreachable(error)) return 'injoignable';
    // Un verdict arrivé avant le refus ou la coupure ne compte pas.
    answer = '';
  }
  const verdict = parseTriAnswer(answer);
  // Des identifiants et le verdict seulement, jamais de texte. `reponse` : attendue (true), aucune (false), ou tri
  // illisible (null).
  console.info(
    '[leon]',
    'brouillons.sorted',
    JSON.stringify({ userId: ctx.userId, sourceId: mail.sourceId, reponse: verdict }),
  );
  return verdict ?? true;
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

// L'appel réservé n'a pas eu lieu, le fournisseur du modèle étant injoignable (réseau, clé refusée, limite, 5xx) : rien
// n'est payé, il est rendu au plafond du jour (rendre_brouillon, 0092), comme pour le point et l'agenda.
async function giveBack(ctx: TenantContext): Promise<void> {
  await db.execute(sql`select rendre_brouillon(${ctx.userId})`);
}

// Les leçons de ses retouches (preferences.ts), après ses mails, dans les `calls` appels qui restent au passage : un
// appel par brouillon retouché, sous le même plafond du jour, qui lit le brouillon, ce qu'elle a envoyé (own-text.ts,
// coupé comme un brouillon) et toutes ses préférences déjà tirées (preference-prompt.ts). La préférence qu'il rend est
// proposée dans sa fiche ; elle ne sert qu'après son oui. « Rien à retenir », ou une préférence déjà tirée mot pour mot,
// pose l'issue sans rien proposer. Une réponse illisible, refusée ou coupée n'écrit rien : la retouche se recompare et
// se retente au passage suivant, tant que son mail a moins de ANSWERED_DAYS jours. Avec PREFERENCES_MAX préférences
// proposées ou acceptées, plus aucun appel : l'issue se pose seule. Un passage à la fois par personne
// (brouillons-queue.ts) : deux appels ne se font jamais pour la même retouche.
async function learnFrom(
  ctx: TenantContext,
  retouches: Reply[],
  calls: number,
  llm: Llm,
  now: Date,
) {
  if (retouches.length === 0) return;
  const known = await readPreferences(ctx);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  let room = PREFERENCES_MAX - known.filter((one) => one.etat !== 'refusee').length;
  for (const reply of retouches) {
    let preference: string | null = null;
    const key = `${ctx.userId}|retouche|${reply.id}`;
    if (room > 0) {
      if (rests(key, now)) continue;
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
        if (isUnreachable(error)) return giveBack(ctx);
        miss(key, now);
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
      if (!result) {
        miss(key, now);
        continue;
      }
      misses.delete(key);
      const found = result.preference;
      preference = found && !known.some((one) => same(one.texte, found)) ? found : null;
    }
    if ((await keepRetouche(ctx, reply.id, preference)) && preference) {
      known.push({ texte: preference, etat: 'proposee' });
      room -= 1;
    }
  }
}

// Ce que l'accueil lit au plus pour le panneau de l'agent, de chaque sorte (les demandes de Leon et les brouillons
// prêts) : les mails les plus récents.
export const HOME_MAX = 20;

export type ReadyBrouillon = {
  id: string;
  sourceId: string;
  // Le correspondant : son nom, à défaut son adresse. Pour une relance, le destinataire de son mail, jamais elle
  // (recipientName), et `receivedAt` est la date de son mail.
  from: string | null;
  receivedAt: Date;
  // Une relance (0089), pas une réponse.
  relance: boolean;
  texte: string;
  // Déposé dans ses brouillons Gmail (brouillon-depot.ts) : un oui ou un non, jamais l'identifiant du brouillon Gmail.
  depose: boolean;
  // Pour une relance, ses autres destinataires, en « à » et en copie, après celui de `from` : ceux à qui elle part
  // (unanswered-mails.ts, relanceRecipients). 0 pour une réponse, qui part à son seul correspondant.
  others: number;
};
// Une demande de Leon : les questions qu'il lui pose avant d'écrire le brouillon, chacune avec ses choix de réponse,
// dans le même ordre (aucun pour une demande posée avant les choix, 0083). `repondue` : elle a répondu, et Leon écrit
// le brouillon. Son oui à une relance, tant que le premier appel n'a rien rendu, en est une sans question, où Leon
// écrit.
export type Demande = Pick<
  ReadyBrouillon,
  'id' | 'sourceId' | 'from' | 'receivedAt' | 'relance'
> & {
  questions: string[];
  choix: string[][];
  repondue: boolean;
};

// Ce que l'accueil montre de l'agent, d'une seule lecture : les demandes de Leon (ses questions, qu'elle y ait répondu
// ou non, et son oui à une relance, tant que le brouillon n'est pas écrit) et les brouillons prêts (ceux qui ont leur
// texte, écrit au premier appel ou avec ses réponses), HOME_MAX de chaque sorte, le mail le plus récent d'abord. Seulement les lignes qu'elle
// n'a pas écartées, et dont le fil n'a pas bougé depuis : le dernier message du fil se relit à chaque affichage, et dès
// qu'elle a répondu, ou qu'un nouveau message est arrivé, la ligne ne se montre plus. À date égale, le même départage
// que readWaitingMails. Et pas la demande d'un mail trop ancien pour un appel (readAnsweredMails) : ses réponses, ou
// son oui, ne feraient plus rien écrire. Parmi les demandes, celles qui attendent sa réponse passent avant celles où Leon
// écrit : elles seules attendent un geste d'elle, et des lignes « Leon écrit » ne doivent pas les cacher.
// Un mail jugé sans réponse à donner, ou son « non » à une relance (ni texte, ni question, ni oui), s'écarte sur sa
// ligne seule, avant de chercher le dernier message de son fil : ces lignes ne se montrent jamais, et leur nombre ne
// fait que grandir.
// Une relance se lit de même, avec ses lignes de réponse : son mail est le dernier du fil, et elle s'y montre avec le
// nom de son premier destinataire et le nombre des autres, ceux à qui elle part (relanceRecipients). Les relances ont
// leurs HOME_MAX places à part : les lignes d'un agent auquel elle a dit non ne cachent pas celles de l'autre
// (l'accueil filtre ensuite par agent, screen.ts).
// shortcut: au-delà de HOME_MAX, les plus anciens ne se montrent pas ; à paginer si une personne en garde autant sans
// les écarter.
export async function readShown(
  ctx: TenantContext,
): Promise<{ demandes: Demande[]; prets: ReadyBrouillon[] }> {
  const own = ownAddresses(ctx, new Date(Date.now() - SENT_MAIL_DAYS * DAY_MS));
  const recipients = relanceRecipients(
    sql`l.recipients_to`,
    sql`l.recipients_cc`,
    sql`o.addresses`,
  );
  const first = sql`(${recipients.to})[1]`;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{
      id: string;
      sourceId: string;
      from: string | null;
      at: string;
      texte: string | null;
      depose: boolean;
      others: number;
      questions: string[] | null;
      choix: string[][] | null;
      repondue: boolean;
      relance: boolean;
    }>(sql`
      select id, "sourceId", "from", at, texte, depose, others, questions, choix, repondue, relance from (
        select b.id, b.source_id as "sourceId", b.sorte = 'relance' as relance,
               case when b.sorte = 'relance' then ${recipientName(ctx, sql`b.source_id`, first)}
                    else coalesce(l.author_name, l.author_email) end as "from",
               case when b.sorte = 'relance'
                    then greatest(cardinality(${recipients.to}) + cardinality(${recipients.cc}) - 1, 0)
                    else 0 end as others,
               extract(epoch from l.ts) as at, b.texte, b.brouillon_gmail is not null as depose,
               b.questions, b.choix, (b.reponses is not null or b.questions is null) as repondue,
               -- Leon écrit (repondue) : vrai aussi de tout brouillon prêt, ce qui ne change pas leur ordre.
               row_number() over (
                 partition by b.texte is null, b.sorte
                 order by (b.reponses is not null or b.questions is null), l.ts desc, b.id
               ) as n
        from brouillons b
        cross join lateral (
          select t.external_id, t.author_name, t.author_email, t.recipients_to, t.recipients_cc, t.ts
          from turns t
          where t.tenant_id = b.tenant_id and t.source_id = b.source_id
          order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
          limit 1
        ) l
        cross join (select ${own} as addresses) o
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
  for (const { at, texte, depose, others, questions, choix, repondue, ...row } of rows) {
    const one = { ...row, receivedAt: epochToDate(at) };
    const asked = questions ?? [];
    if (texte !== null) prets.push({ ...one, texte, depose, others });
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

// Sa réponse à son mail resté sans réponse (unanswered-mails.ts), depuis l'accueil : « Oui », avec ses indications (vides quand elle n'en donne pas), ou « Non » (null). Une ligne de relance s'écrit pour ce mail
// (0089) : son oui attend le passage suivant, qui fera le premier appel ; son non le ferme pour de bon, sans appel. Rend
// l'identifiant de la ligne, ou null sans rien écrire si ce n'est plus un mail sans réponse : à elle, toujours le
// dernier de son fil, dans la fenêtre, pas encore traité (unansweredMails, la même requête que l'accueil, sans le filtre
// du texte) ; ou si son compte est supprimé. Deux envois simultanés n'en gardent qu'un : une seule ligne par message
// (0080). L'appelant a borné les indications (settings/actions.ts) ; la table aussi.
export async function answerRelance(
  ctx: TenantContext,
  mail: { sourceId: string; message: string },
  indications: string | null,
): Promise<string | null> {
  if (!z.uuid().safeParse(mail.sourceId).success) return null;
  const line = sql`s.tenant_id, ${ctx.userId}::uuid, s.id, l.message, ${indications}::text, 'relance',
                   array[${ctx.userId}::uuid]`;
  return withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return null;
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into brouillons (tenant_id, user_id, source_id, message, indications, sorte, acl)
      ${unansweredMails(ctx, new Date(), line, mail)}
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
