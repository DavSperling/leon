import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lignesFiche } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { epochToDate } from '@/server/search/filters-sql';
import { lockAccount } from './fiche';
import { parseValeur } from './lines';
import type { Preference } from './preference-prompt';
import { issueOf } from './retouche';
import { MESSAGE, PART, sentTurns } from './sent-mails';
import { ANSWERED_DAYS } from './waiting-mails';

// Ses retouches : ce qu'elle a fait des brouillons de Leon, vu sur la réponse qu'elle a vraiment envoyée, et les
// préférences d'écriture qu'un modèle en tire, une ligne de sa fiche chacune (0087). Rien ne s'apprend d'un brouillon
// qu'elle n'a pas envoyé, ni d'un mail qu'elle a écrit sans brouillon de Leon, et une préférence ne sert qu'après son
// oui. Tout se lit et s'écrit sous withTenant de la personne, et seulement dans SES fils (sentTurns). Le passage de la
// file (brouillons.ts) compare en tête, et fait l'appel au modèle après ses mails : il suit chaque relève de sa boîte.

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

// Dix préférences au plus, proposées ou acceptées : au-delà, Leon n'en propose plus, et une retouche ne fait plus
// d'appel. Elle en a donc dix acceptées au plus.
// shortcut: passé dix, Leon n'apprend plus rien ; à revoir (en remplacer une) si une personne en a besoin de plus. Une
// préférence proposée dont le brouillon a disparu avec son fil ne se montre plus et garde sa place.
export const PREFERENCES_MAX = 10;

// Toutes ses préférences, même retirées : une préférence retirée compte comme refusée, et ne se repropose pas.
export async function readPreferences(ctx: TenantContext): Promise<Preference[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ valeur: lignesFiche.valeur, retireeLe: lignesFiche.retireeLe })
      .from(lignesFiche)
      .where(
        and(
          eq(lignesFiche.tenantId, ctx.tenantId),
          eq(lignesFiche.userId, ctx.userId),
          eq(lignesFiche.genre, 'preference'),
        ),
      ),
  );
  return rows.flatMap(({ valeur, retireeLe }) => {
    const one = parseValeur('preference', valeur) as Preference | null;
    return one ? [{ texte: one.texte, etat: retireeLe ? 'refusee' : one.etat }] : [];
  });
}

// La leçon d'une retouche : « retouche » se pose sur la ligne du brouillon (poser_issue) et, s'il y en a une, la
// préférence proposée entre dans sa fiche, provenance « apprise », sa clé étant le brouillon : les deux, ou rien. Rend
// false sans rien écrire pour un compte supprimé (lockAccount), ou un brouillon qui n'attendait plus (écarté, déjà
// traité par un autre passage).
export async function keepRetouche(
  ctx: TenantContext,
  id: string,
  preference: string | null,
): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return false;
    const { rows } = await tx.execute<{ ok: boolean }>(
      sql`select poser_issue(${id}, 'retouche') as ok`,
    );
    if (rows[0]?.ok !== true) return false;
    if (preference)
      await tx
        .insert(lignesFiche)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          genre: 'preference',
          cle: id,
          valeur: { texte: preference, etat: 'proposee' },
          provenance: 'apprise',
          acl: [ctx.userId],
        })
        .onConflictDoNothing();
    return true;
  });
}

// Une préférence proposée, telle que l'accueil la montre (screen.ts) : sa ligne, son texte, le correspondant du mail
// dont elle a retouché le brouillon (son nom, à défaut son adresse), la date de ce mail et son fil. Rien d'autre du
// mail, ni de sa réponse.
export type ProposedPreference = {
  id: string;
  sourceId: string;
  from: string | null;
  receivedAt: Date;
  preference: string;
};

// Les `max` préférences qui attendent sa réponse, la plus récente d'abord (la date du mail reçu). Une préférence dont le
// brouillon est parti avec son fil ne se montre plus.
export async function readProposedPreferences(
  ctx: TenantContext,
  max: number,
): Promise<ProposedPreference[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Omit<ProposedPreference, 'receivedAt'> & { at: string }>(sql`
      select l.id, l.valeur->>'texte' as preference, b.source_id as "sourceId",
             coalesce(m.author_name, m.author_email) as "from", extract(epoch from m.ts) as at
      from lignes_fiche l
      join brouillons b on b.tenant_id = l.tenant_id and b.user_id = l.user_id and b.id::text = l.cle
      cross join lateral (
        select t.author_name, t.author_email, t.ts from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
          and substring(t.external_id from ${MESSAGE}) = b.message
        order by t.ts
        limit 1
      ) m
      where l.tenant_id = ${ctx.tenantId} and l.user_id = ${ctx.userId} and l.genre = 'preference'
        and l.retiree_le is null and l.valeur->>'etat' = 'proposee'
      order by m.ts desc, l.id
      limit ${max}`),
  );
  return rows.map(({ at, ...one }) => ({ ...one, receivedAt: epochToDate(at) }));
}

// Sa réponse à une préférence proposée, depuis le panneau de l'accueil : « Oui », elle sert aux brouillons suivants
// (brouillon-prompt.ts) ; « Non », elle reste en base, refusée, pour n'être jamais reproposée. Rend false sans rien
// écrire si la ligne n'est pas une préférence à elle qui attend encore sa réponse (déjà répondue, retirée). Deux envois
// simultanés n'en gardent qu'un : le second relit la ligne, et ne la trouve plus proposée.
export async function answerPreference(
  ctx: TenantContext,
  id: string,
  oui: boolean,
): Promise<boolean> {
  if (!z.uuid().safeParse(id).success) return false;
  const etat: Preference['etat'] = oui ? 'acceptee' : 'refusee';
  const answered = await withTenant(ctx, (tx) =>
    tx
      .update(lignesFiche)
      .set({ valeur: sql`jsonb_set(${lignesFiche.valeur}, '{etat}', to_jsonb(${etat}::text))` })
      .where(
        and(
          eq(lignesFiche.tenantId, ctx.tenantId),
          eq(lignesFiche.userId, ctx.userId),
          eq(lignesFiche.id, id),
          eq(lignesFiche.genre, 'preference'),
          isNull(lignesFiche.retireeLe),
          sql`${lignesFiche.valeur}->>'etat' = 'proposee'`,
        ),
      )
      .returning({ id: lignesFiche.id }),
  );
  return answered.length > 0;
}
