import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { factText } from '@/capture/session-facts';
import { ProjectSchema } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lecons } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { LISIBLE, writeVersion } from './versions';

// Les leçons (T55 ; D33, D34, D37 et C13 du plan de la mémoire à disposition) : un texte court, relu et accepté par
// un humain, privé à son auteur, avec un dépôt facultatif (0066). Son texte et ses preuves sont ceux de sa dernière
// version (versions.ts). Seules les actions du site écrivent, corrigent et retirent : aucune route à jeton ni aucun
// outil MCP n'appelle writeLesson, correctLesson ni retireLesson. Toute lecture se fait sous withTenant, avec en plus
// le filtre de l'auteur.

// D37 : 300 caractères au plus.
export const LESSON_MAX = 300;
const TexteSchema = z.string().trim().min(1).max(LESSON_MAX);
const IdSchema = z.uuid();

export type Lesson = {
  id: string;
  projet: string | null;
  origine: (typeof lecons.$inferSelect)['origine'];
  frequence: number;
  accepteeLe: Date;
  // Sa dernière version, lisible (D33).
  n: number;
  texte: string;
  entrees: string[];
  creeLe: Date;
};

type Row = {
  id: string;
  projet: string | null;
  origine: Lesson['origine'];
  frequence: number;
  // Le pilote rend une date en texte à une requête brute.
  acceptee_le: string;
  n: number;
  texte: string;
  entrees: string[];
  cree_le: string;
};

// Les leçons non retirées de l'auteur qui passent `filtre`, chacune avec sa dernière version si elle est lisible ;
// sinon la leçon ne se montre pas, jamais avec une version plus ancienne (D33). Dans l'ordre de D37 : celles d'un dépôt
// d'abord, puis les plus fréquentes, puis les plus récemment acceptées.
async function select(tx: Tx, ctx: TenantContext, filtre: SQL): Promise<Lesson[]> {
  const { rows } = await tx.execute<Row>(sql`
    select l.id, l.projet, l.origine, l.frequence, l.acceptee_le, d.n, d.texte, d.entrees, d.cree_le
      from lecons l
      cross join lateral (
        select v.n, v.texte, v.entrees, v.cree_le, ${LISIBLE} as lisible
          from versions_memoire v left join versions_memoire o on o.id = v.restaure_de
         where v.tenant_id = l.tenant_id and v.lecon_id = l.id
         order by v.n desc limit 1) d
     where l.tenant_id = ${ctx.tenantId} and l.owner_user_id = ${ctx.userId} and l.retiree_le is null
       and d.lisible and ${filtre}
     order by (l.projet is not null) desc, l.frequence desc, l.acceptee_le desc, l.id`);
  return rows.map((row) => ({
    id: row.id,
    projet: row.projet,
    origine: row.origine,
    frequence: row.frequence,
    accepteeLe: new Date(row.acceptee_le),
    n: row.n,
    texte: row.texte,
    entrees: row.entrees,
    creeLe: new Date(row.cree_le),
  }));
}

// Avec `projet` : les leçons de ce dépôt et celles sans dépôt, jamais celles d'un autre (D37). Sans : toutes celles de
// l'auteur, tous dépôts confondus (la section Mémoire du site).
export async function listLessons(ctx: TenantContext, projet?: string): Promise<Lesson[]> {
  return withTenant(ctx, (tx) =>
    select(
      tx,
      ctx,
      projet === undefined ? sql`true` : sql`(l.projet = ${projet} or l.projet is null)`,
    ),
  );
}

// Une leçon de l'auteur, non retirée et lisible ; sinon null.
export async function readLesson(ctx: TenantContext, id: string): Promise<Lesson | null> {
  if (!IdSchema.safeParse(id).success) return null;
  const [lesson] = await withTenant(ctx, (tx) => select(tx, ctx, sql`l.id = ${id}`));
  return lesson ?? null;
}

// Écrit une leçon et sa v1, écrite par l'humain. Le texte passe par maskSecrets : il part ensuite vers le fournisseur
// de chaque outil de code (D37). Le masque peut l'allonger : la borne se réapplique après.
export async function writeLesson(
  ctx: TenantContext,
  input: { texte: string; projet?: string },
): Promise<{ id: string; n: number } | 'invalide'> {
  const parsed = z
    .object({ texte: TexteSchema, projet: ProjectSchema.optional() })
    .safeParse(input);
  if (!parsed.success) return 'invalide';
  return withTenant(ctx, async (tx) => {
    const [lesson] = await tx
      .insert(lecons)
      .values({
        tenantId: ctx.tenantId,
        ownerUserId: ctx.userId,
        projet: parsed.data.projet ?? null,
        origine: 'humain',
        acl: [ctx.userId],
      })
      .returning({ id: lecons.id });
    if (!lesson) throw new Error('leçon non écrite');
    const written = await writeVersion(tx, ctx, {
      leconId: lesson.id,
      attendue: 0,
      texte: factText(parsed.data.texte, LESSON_MAX),
      entrees: [],
      ecritPar: 'humain',
      motif: 'acceptation',
    });
    // Une leçon neuve n'est jamais dépassée ; un compte supprimé n'a plus de session du site. L'erreur annule tout.
    if (typeof written !== 'object') throw new Error('version de la leçon non écrite');
    return { id: lesson.id, n: written.n };
  });
}

// La corrige : v(depuis+1), en compare-and-set (D34), avec les preuves de la dernière version. Une version dépassée
// rend « depassee » (« modifiée entre-temps »), sans rien écrire. Une leçon retirée, illisible ou d'un autre est
// introuvable.
export async function correctLesson(
  ctx: TenantContext,
  input: { id: string; texte: string; depuis: number },
): Promise<{ n: number } | 'depassee' | 'introuvable' | 'invalide'> {
  const texte = TexteSchema.safeParse(input.texte);
  if (!texte.success) return 'invalide';
  if (!IdSchema.safeParse(input.id).success) return 'introuvable';
  return withTenant(ctx, async (tx) => {
    const [current] = await select(tx, ctx, sql`l.id = ${input.id}`);
    if (!current) return 'introuvable';
    const written = await writeVersion(tx, ctx, {
      leconId: input.id,
      attendue: input.depuis,
      texte: factText(texte.data, LESSON_MAX),
      entrees: current.entrees,
      ecritPar: 'humain',
      motif: 'correction',
    });
    // « gardee » ne vaut que pour la liste du serveur, jamais pour l'humain.
    return written === 'gardee' ? 'introuvable' : written;
  });
}

// La retire : elle sort des listes, ses versions restent (D33). Rend false si elle n'est pas à l'auteur, ou déjà
// retirée.
export async function retireLesson(ctx: TenantContext, id: string): Promise<boolean> {
  if (!IdSchema.safeParse(id).success) return false;
  const retired = await withTenant(ctx, (tx) =>
    tx
      .update(lecons)
      .set({ retireeLe: sql`now()` })
      .where(
        and(
          eq(lecons.tenantId, ctx.tenantId),
          eq(lecons.id, id),
          eq(lecons.ownerUserId, ctx.userId),
          isNull(lecons.retireeLe),
        ),
      )
      .returning({ id: lecons.id }),
  );
  return retired.length > 0;
}
