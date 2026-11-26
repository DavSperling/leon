import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { brouillons } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { epochToDate } from '@/server/search/filters-sql';
import { lockAccount } from './fiche';
import { MESSAGE } from './sent-mails';
import { WAITING_DAYS } from './waiting-mails';

// Les mails qu'elle a reçus et que Leon a jugés sans réponse à donner (brouillons.ts), pour l'entrée « n'attendent pas
// votre réponse » de l'accueil : elle les voit, et pour chacun peut demander quand même une réponse (prepareReply) ou
// le supprimer (brouillon-depot.ts, trashMail). Rien ne se lit que la ligne : ni texte, ni question, ni indications,
// de sorte « reponse » (le non à une relance a les mêmes champs vides), pas écartée. Peu importe ce qui a posé ce
// verdict. Aucun appel au modèle pour la liste. Tout se lit et s'écrit sous withTenant de la personne.

// Sous l'alias `b` : une ligne sans réponse à donner.
const QUIET = sql`b.sorte = 'reponse' and b.texte is null and b.questions is null and b.indications is null
  and b.ecarte_le is null`;
// Le dernier message du fil de `b` : à date égale, le même départage que partout (readShown, brouillons.ts).
const LAST = sql`(
  select t.external_id, t.author_name, t.author_email, t.ts
  from turns t
  where t.tenant_id = b.tenant_id and t.source_id = b.source_id
  order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
  limit 1
)`;

export type SansReponse = {
  // La ligne, que ses gestes visent.
  id: string;
  sourceId: string;
  // Le correspondant : son nom, à défaut son adresse.
  from: string | null;
  receivedAt: Date;
};

// Les `max` plus récents, de moins de WAITING_DAYS jours (la fenêtre des mails que Leon lit : un mail laissé là sort de
// la liste de lui-même), et dont le fil n'a pas bougé : dès qu'elle a répondu, ou qu'un nouveau message est arrivé, le
// mail n'y est plus.
// shortcut: toutes ses lignes sans réponse se relisent à chaque accueil, leur nombre ne faisant que grandir ; une date
// sur la ligne et un index quand une personne en garde des milliers.
export async function readSansReponse(ctx: TenantContext, max: number): Promise<SansReponse[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ id: string; sourceId: string; from: string | null; at: string }>(sql`
      select b.id, b.source_id as "sourceId", coalesce(l.author_name, l.author_email) as "from",
             extract(epoch from l.ts) as at
      from brouillons b
      cross join lateral ${LAST} l
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId} and ${QUIET}
        and substring(l.external_id from ${MESSAGE}) = b.message
        and l.ts >= now() - make_interval(days => ${WAITING_DAYS})
      order by l.ts desc, b.id
      limit ${max}`),
  );
  return rows.map(({ at, ...row }) => ({ ...row, receivedAt: epochToDate(at) }));
}

// « Préparer une réponse », depuis l'accueil : elle veut quand même répondre à ce mail. Sa ligne devient son oui, avec
// ses indications (vides quand elle n'en donne pas) : l'état d'une ligne dont le passage suivant fait le premier appel
// (0084), sous le plafond du jour, avec la consigne d'une réponse demandée (brouillon-prompt.ts). Rend l'identifiant
// de la ligne, ou null sans rien écrire si ce n'est pas un mail sans réponse à elle, toujours le dernier de son fil, ou
// si son compte est supprimé. L'appelant a borné les indications (settings/actions.ts) ; la table aussi (0084).
// L'app n'a pas le droit de changer les indications d'une ligne (0084) : la ligne sans réponse est remplacée par celle
// de son oui, dans la même transaction, et change d'identifiant. Deux demandes simultanées n'en gardent qu'une : la
// seconde attend la première, et ne trouve plus rien à remplacer.
export async function prepareReply(
  ctx: TenantContext,
  id: string,
  indications: string,
): Promise<string | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return null;
    const { rows } = await tx.execute<{ sourceId: string; message: string }>(sql`
      delete from brouillons b
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId} and b.id = ${id} and ${QUIET}
        and b.message = (select substring(l.external_id from ${MESSAGE}) from ${LAST} l)
      returning b.source_id as "sourceId", b.message`);
    const [gone] = rows;
    if (!gone) return null;
    const [kept] = await tx
      .insert(brouillons)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sourceId: gone.sourceId,
        message: gone.message,
        indications,
        acl: [ctx.userId],
      })
      .returning({ id: brouillons.id });
    return kept?.id ?? null;
  });
}
