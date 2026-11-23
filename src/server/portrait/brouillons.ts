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
import { epochToDate } from '@/server/search/filters-sql';
import { EN_SERVICE } from './agents';
import { depositBrouillon } from './brouillon-depot';
import { buildBrouillonPrompt, parseBrouillonAnswer } from './brouillon-prompt';
import { handWritten } from './facts';
import { lockAccount, readFiche } from './fiche';
import { readProposals } from './propositions';
import { MESSAGE, readSentMails, SENT_MAIL_DAYS } from './sent-mails';
import { readWaitingMails } from './waiting-mails';

// L'agent « Brouillons de réponse », le premier en service : pour chaque mail qui attend la réponse de la personne
// (waiting-mails.ts), un modèle écrit un brouillon comme elle l'écrirait (brouillon-prompt.ts), gardé dans sa table
// privée (0080) et montré dans Leon. Un brouillon complet est aussi déposé dans ses brouillons Gmail, en réponse dans
// le fil (brouillon-depot.ts) : c'est tout ce que Leon écrit dans sa boîte. Rien n'est envoyé : l'agent prépare, elle
// valide. Tout se lit et s'écrit sous withTenant de la personne ; l'appel au modèle et le dépôt se font hors de toute
// transaction. Le worker de la file `brouillons-ecrire` lance un passage (brouillons-worker.ts).

// Le plafond de dépense : au plus 20 appels au modèle par personne et par jour (UTC, reserver_brouillon, 0080), un par
// mail. Un appel lit environ 4 000 jetons (la consigne, quatre messages et trois exemples coupés) et en écrit un
// millier : 2 centimes avec Sonnet, donc 40 centimes par personne et par jour au plus (estimé d'après le tarif de
// models.ts, pas mesuré). Le dépôt dans Gmail suit le même plafond : un brouillon écrit, un dépôt au plus, de deux
// requêtes, donc 40 crédits Pipedream par personne et par jour au plus.
export const BROUILLONS_DAILY_CAP = 20;
// Borne le texte ET la réflexion du modèle (llm.ts) : un brouillon de 6 000 caractères en prend environ 2 000, le reste
// est la marge de la réflexion à l'effort « medium ».
const BROUILLON_MAX_TOKENS = 8000;
const BROUILLON_TIMEOUT_MS = 90_000;

// Un passage : un brouillon pour chacun de ses mails qui attendent, cinq au plus (waiting-mails.ts), un appel au modèle
// par mail. Rend le nombre de brouillons écrits. Ne fait rien pour un compte supprimé, ni pour qui n'a pas répondu
// « oui » à l'agent, ni quand il ne lui est plus proposé (sa boîte débranchée). Passé le plafond du jour, il s'arrête.
// Un mail dont la réponse du modèle est illisible, refusée ou coupée n'écrit rien : il attend toujours, et le passage
// suivant le retente, sous le même plafond. Un mail qui a son résultat (un brouillon, ou « sans réponse ») n'est jamais
// redemandé au modèle, et son brouillon n'est déposé qu'ici, une fois, juste après son écriture.
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
  const waiting = await readWaitingMails(ctx, now);
  if (waiting.length === 0) return 0;
  const [person] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, ctx.userId));
  // Ses mails écrits de sa main : le brouillon y prend ses exemples.
  const sent = handWritten((await readSentMails(ctx, SENT_MAIL_DAYS, now)).mails);
  let written = 0;
  for (const mail of waiting) {
    const { rows } = await db.execute<{ ok: boolean }>(
      sql`select reserver_brouillon(${ctx.userId}, ${BROUILLONS_DAILY_CAP}) as ok`,
    );
    if (rows[0]?.ok !== true) {
      console.warn('[leon]', 'brouillons.daily_cap', JSON.stringify({ userId: ctx.userId }));
      break;
    }
    const prompt = buildBrouillonPrompt({ personName: person?.name ?? '', mail, lines, sent });
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
    const result = parseBrouillonAnswer(answer);
    // Des identifiants et des nombres seulement, jamais de texte. `brouillon` : écrit (true), sans réponse à donner
    // (false), ou réponse illisible (null).
    console.info(
      '[leon]',
      'brouillons.answered',
      JSON.stringify({
        userId: ctx.userId,
        sourceId: mail.sourceId,
        brouillon: result && result.texte !== null,
        chars: answer.length,
      }),
    );
    if (!result) continue;
    // L'appel au modèle dure jusqu'à 90 s : un compte supprimé entre-temps ne reçoit rien (lockAccount), et un
    // résultat déjà écrit pour ce message n'est pas écrasé.
    const stored = await withTenant(ctx, async (tx) => {
      if (!(await lockAccount(tx, ctx))) return [];
      return tx
        .insert(brouillons)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sourceId: mail.sourceId,
          message: mail.message,
          texte: result.texte,
          acl: [ctx.userId],
        })
        .onConflictDoNothing()
        .returning({ id: brouillons.id });
    });
    const [kept] = stored;
    if (!kept || result.texte === null) continue;
    written += 1;
    // Le destinataire est l'auteur du mail reçu, jamais ce qu'écrit le modèle. Un dépôt qui échoue n'arrête rien.
    await depositBrouillon(ctx, { id: kept.id, to: mail.from }, deps);
  }
  return written;
}

// Ce que l'écran montre au plus : les brouillons des mails les plus récents.
// shortcut: au-delà, les plus anciens ne se montrent pas ; à paginer si une personne en garde autant sans les écarter.
const SHOWN_MAX = 20;

export type ReadyBrouillon = {
  id: string;
  sourceId: string;
  // Le correspondant : son nom, à défaut son adresse.
  from: string | null;
  receivedAt: Date;
  texte: string;
};

// Ses brouillons prêts, le mail le plus récent d'abord : ceux qu'elle n'a pas écartés, et dont le fil n'a pas bougé
// depuis. Le dernier message du fil se relit à chaque affichage : dès qu'elle a répondu, ou qu'un nouveau message est
// arrivé, le brouillon ne se montre plus. À date égale, le même départage que readWaitingMails.
export async function readBrouillons(ctx: TenantContext): Promise<ReadyBrouillon[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Omit<ReadyBrouillon, 'receivedAt'> & { at: string }>(sql`
      select b.id, b.source_id as "sourceId", coalesce(l.author_name, l.author_email) as "from",
             extract(epoch from l.ts) as at, b.texte
      from brouillons b
      cross join lateral (
        select t.external_id, t.author_name, t.author_email, t.ts
        from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
        order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
        limit 1
      ) l
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId}
        and b.texte is not null and b.ecarte_le is null
        and substring(l.external_id from ${MESSAGE}) = b.message
      order by l.ts desc, b.id
      limit ${SHOWN_MAX}`),
  );
  return rows.map(({ at, ...row }) => ({ ...row, receivedAt: epochToDate(at) }));
}

// L'écarte : il ne se montre plus, et son mail reste traité (aucun autre brouillon ne lui sera écrit). Rend false s'il
// n'est pas à la personne, ou déjà écarté.
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
