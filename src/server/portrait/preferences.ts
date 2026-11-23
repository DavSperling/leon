import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { issueOf } from './retouche';
import { MESSAGE, PART, sentTurns } from './sent-mails';
import { ANSWERED_DAYS } from './waiting-mails';

// Ses retouches : ce qu'elle a fait des brouillons de Leon, vu sur la réponse qu'elle a vraiment envoyée. Rien ne
// s'apprend d'un brouillon qu'elle n'a pas envoyé, ni d'un mail qu'elle a écrit sans brouillon de Leon. Tout se lit et
// s'écrit sous withTenant de la personne, et seulement dans SES fils (sentTurns). Le passage de la file (brouillons.ts)
// le fait en tête : il suit chaque relève de sa boîte.

// Ce que la lecture garde de sa réponse : son texte, et le début de la citation que ownText retire ensuite.
const REPLY_CHARS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Un brouillon de Leon et la réponse qu'elle a envoyée, citation et signature comprises.
export type Reply = { id: string; texte: string; envoye: string };

// Ses brouillons écrits (un texte, pas écartés) sans issue encore, dont le mail reçu a moins de ANSWERED_DAYS jours,
// avec sa réponse : le premier de ses mails envoyés dans le même fil, après le message auquel le brouillon répondait.
// Ni un envoi d'avant, ni le mail d'un collègue (il n'est pas de son côté), ni un fil d'une autre boîte. Un brouillon
// sans réponse d'elle n'est pas rendu. Un mail coupé en plusieurs tours se recolle dans l'ordre de ses morceaux.
async function readReplies(ctx: TenantContext, now: Date): Promise<Reply[]> {
  const since = new Date(now.getTime() - ANSWERED_DAYS * DAY_MS);
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Reply>(sql`
      select b.id, b.texte, r.text as envoye
      from brouillons b
      cross join lateral (
        select min(t.ts) as ts from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
          and substring(t.external_id from ${MESSAGE}) = b.message
      ) m
      cross join lateral (
        select substring(t.external_id from ${MESSAGE}) as message
        from turns t
        join sources s on s.tenant_id = t.tenant_id and s.id = t.source_id
        where ${sentTurns(ctx, since)} and t.source_id = b.source_id and t.ts > m.ts
        order by t.ts, substring(t.external_id from ${MESSAGE})
        limit 1
      ) f
      cross join lateral (
        select left(string_agg(t.text, ${'\n'} order by coalesce(substring(t.external_id from ${PART})::int, 0)),
                    ${REPLY_CHARS}) as text
        from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
          and substring(t.external_id from ${MESSAGE}) = f.message
      ) r
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId}
        and b.texte is not null and b.ecarte_le is null and b.issue is null
        and m.ts >= ${since.toISOString()}::timestamptz
      order by m.ts, b.id`),
  );
  return rows;
}

// Compare chacun de ses brouillons qui a reçu sa réponse depuis le dernier passage (retouche.ts), sans modèle : envoyé
// tel quel, ou réécrit, son issue se pose sur sa ligne (poser_issue, 0086), une fois. Rend les brouillons retouchés :
// leur issue ne se pose qu'avec la leçon qu'en tire le modèle, et une retouche dont la leçon reste à tirer se compare
// de nouveau au passage suivant.
export async function compareReplies(ctx: TenantContext, now: Date): Promise<Reply[]> {
  const replies = await readReplies(ctx, now);
  const compared = replies.map((reply) => ({ reply, issue: issueOf(reply.texte, reply.envoye) }));
  // Des identifiants et des nombres seulement, jamais de texte.
  for (const { reply, issue } of compared)
    console.info(
      '[leon]',
      'brouillons.issue',
      JSON.stringify({ userId: ctx.userId, brouillonId: reply.id, issue }),
    );
  const settled = compared.filter(({ issue }) => issue !== 'retouche');
  if (settled.length > 0)
    await withTenant(ctx, async (tx) => {
      for (const { reply, issue } of settled)
        await tx.execute(sql`select poser_issue(${reply.id}, ${issue})`);
    });
  return compared.flatMap(({ reply, issue }) => (issue === 'retouche' ? [reply] : []));
}
