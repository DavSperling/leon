import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { organizations, users } from '@/server/db/schema/auth';
import { lignesFiche } from '@/server/db/schema/portrait';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { computeFacts } from './facts';
import { factsToLines, type Genre, type LineValue, parseValeur } from './lines';
import { readSentMails } from './sent-mails';

// La fiche d'une personne, enregistrée ligne à ligne (0076) : construite d'après ses mails envoyés, puis relue,
// corrigée et retirée par elle seule. Son rôle et ses tâches s'y ajoutent une fois, écrits par un modèle (synthese.ts).
// Tout se fait sous withTenant de la personne, avec en plus le filtre de la personne. Seul son bouton « Construire ma
// fiche » lance la construction (queue.ts, worker.ts).

// Les heures et les jours d'envoi se lisent à l'heure de Paris, comme le reste de l'interface (src/lib/format.ts).
const TIME_ZONE = 'Europe/Paris';
const IdSchema = z.uuid();

export type FicheLine = {
  id: string;
  genre: Genre;
  cle: string;
  valeur: LineValue;
  provenance: (typeof lignesFiche.$inferSelect)['provenance'];
  // Le nombre de mails sur lequel un calcul repose ; nul pour une ligne écrite par la personne ou par un modèle.
  mails: number | null;
  corrigeeLe: Date | null;
};

// La ligne `id` de la personne, si elle ne l'a pas retirée.
const own = (ctx: TenantContext, id: string) =>
  and(
    eq(lignesFiche.tenantId, ctx.tenantId),
    eq(lignesFiche.userId, ctx.userId),
    eq(lignesFiche.id, id),
    isNull(lignesFiche.retireeLe),
  );

// La garde de toute écriture dans la fiche, dans sa transaction : false pour un compte supprimé, à qui rien ne s'écrit.
// L'organisation d'abord, en FOR KEY SHARE, comme lockTarget (versions.ts) : la suppression du compte la prend en
// premier (lockMembers). Elle est donc validée avant, et le compte se lit supprimé, ou elle attend la fin de cette
// écriture et efface les lignes.
export async function lockAccount(tx: Tx, ctx: TenantContext): Promise<boolean> {
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId))
    .for('key share');
  const [account] = await tx
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, ctx.userId));
  return account !== undefined && account.deletedAt === null;
}

// Construit la fiche, ou la reconstruit : les lignes calculées prennent leur nouvelle valeur, une ligne que la
// personne a corrigée (elle n'est plus un calcul) ou retirée reste telle quelle. Un compte supprimé n'a plus de
// fiche, et n'en reçoit plus.
// shortcut: une ligne calculée que le nouveau calcul ne rend plus (un interlocuteur sorti des 30 premiers) reste avec
// son ancienne valeur, à effacer ici si une reconstruction doit aussi oublier.
export async function buildFiche(ctx: TenantContext): Promise<void> {
  const { mails, domains } = await readSentMails(ctx);
  const lines = factsToLines(computeFacts(mails, { domains, timeZone: TIME_ZONE }));
  if (lines.length === 0) return;
  await withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return;
    await tx
      .insert(lignesFiche)
      .values(
        lines.map((line) => ({
          ...line,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          provenance: 'calcul' as const,
          acl: [ctx.userId],
        })),
      )
      .onConflictDoUpdate({
        target: [lignesFiche.tenantId, lignesFiche.userId, lignesFiche.genre, lignesFiche.cle],
        set: { valeur: sql`excluded.valeur`, mails: sql`excluded.mails` },
        setWhere: sql`${lignesFiche.provenance} = 'calcul' and ${lignesFiche.retireeLe} is null`,
      });
  });
}

// Les lignes que la personne n'a pas retirées. Une valeur gardée qui n'a plus la forme de son genre ne se montre pas.
export async function readFiche(ctx: TenantContext): Promise<FicheLine[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: lignesFiche.id,
        genre: lignesFiche.genre,
        cle: lignesFiche.cle,
        valeur: lignesFiche.valeur,
        provenance: lignesFiche.provenance,
        mails: lignesFiche.mails,
        corrigeeLe: lignesFiche.corrigeeLe,
      })
      .from(lignesFiche)
      .where(
        and(
          eq(lignesFiche.tenantId, ctx.tenantId),
          eq(lignesFiche.userId, ctx.userId),
          isNull(lignesFiche.retireeLe),
        ),
      ),
  );
  return rows.flatMap((row) => {
    const valeur = parseValeur(row.genre, row.valeur);
    return valeur ? [{ ...row, valeur }] : [];
  });
}

// Remplace la valeur d'une ligne, dans la forme de son genre : la ligne devient écrite par la personne, et une
// reconstruction n'y touche plus. Une ligne retirée, ou d'une autre personne, est introuvable.
export async function correctLine(
  ctx: TenantContext,
  id: string,
  valeur: unknown,
): Promise<'ok' | 'invalide' | 'introuvable'> {
  if (!IdSchema.safeParse(id).success) return 'introuvable';
  return withTenant(ctx, async (tx) => {
    const [line] = await tx
      .select({ genre: lignesFiche.genre })
      .from(lignesFiche)
      .where(own(ctx, id));
    if (!line) return 'introuvable';
    const valid = parseValeur(line.genre, valeur);
    if (!valid) return 'invalide';
    await tx
      .update(lignesFiche)
      .set({ valeur: valid, provenance: 'personne', mails: null, corrigeeLe: sql`now()` })
      .where(own(ctx, id));
    return 'ok';
  });
}

// Ce que la personne corrige elle-même dans une ligne : un texte, ou le registre d'un interlocuteur. Le reste de la
// ligne (les sources d'une tâche, les comptes d'un interlocuteur) et les autres genres sont des mesures.
// Postgres refuse \u0000 et un demi-caractère (la moitié d'un emoji) dans un jsonb : un tel texte est refusé ici.
const texte = z
  .string()
  .trim()
  .refine((text) => text.isWellFormed() && !text.includes('\u0000'));
const CHAMPS: Partial<Record<Genre, z.ZodType<Record<string, unknown>>>> = {
  role: z.strictObject({ texte }),
  signature: z.strictObject({ texte }),
  tache: z.strictObject({ titre: texte, detail: texte }),
  interlocuteur: z.strictObject({ registre: z.enum(['tutoiement', 'vouvoiement']).nullable() }),
};

// Corrige les seuls champs modifiables d'une ligne (CHAMPS) : la valeur entière se refait ici, d'après la ligne
// enregistrée, puis passe par correctLine, qui en valide la forme. Un champ de plus, ou un genre qui ne se corrige
// pas, est refusé.
// shortcut: la ligne se lit puis s'écrit en deux transactions : une reconstruction passée entre les deux verrait ses
// comptes remplacés par ceux d'avant, à faire en une seule si une reconstruction devient fréquente.
export async function correctFields(
  ctx: TenantContext,
  id: string,
  champs: unknown,
): Promise<'ok' | 'invalide' | 'introuvable'> {
  if (!IdSchema.safeParse(id).success) return 'introuvable';
  const [line] = await withTenant(ctx, (tx) =>
    tx
      .select({ genre: lignesFiche.genre, valeur: lignesFiche.valeur })
      .from(lignesFiche)
      .where(own(ctx, id)),
  );
  if (!line) return 'introuvable';
  const parsed = CHAMPS[line.genre]?.safeParse(champs);
  if (!parsed?.success) return 'invalide';
  return correctLine(ctx, id, { ...line.valeur, ...parsed.data });
}

// La retire : elle sort de la fiche et reste en base, pour qu'une reconstruction ne la fasse pas revenir. Rend false
// si elle n'est pas à la personne, ou déjà retirée.
export async function retireLine(ctx: TenantContext, id: string): Promise<boolean> {
  if (!IdSchema.safeParse(id).success) return false;
  const retired = await withTenant(ctx, (tx) =>
    tx
      .update(lignesFiche)
      .set({ retireeLe: sql`now()` })
      .where(own(ctx, id))
      .returning({ id: lignesFiche.id }),
  );
  return retired.length > 0;
}
