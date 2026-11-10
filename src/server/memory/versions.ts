import { and, eq, inArray, sql } from 'drizzle-orm';
import { factText } from '@/capture/session-facts';
import { CODE_SESSION_KINDS } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { organizations, users } from '@/server/db/schema/auth';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { textArray } from '@/server/search/filters-sql';

// Les versions de la mémoire (T53 ; D33, D34 et C12 du plan de la mémoire à disposition) : l'état d'un fil et les
// notes de l'agent s'écrivent v1, v2, v3, en ajout seul, hors de la recherche et de fetch (0052). Seul ce module les
// lit. Tout se fait sous withTenant de l'auteur.
//
// - L'écriture est un compare-and-set (D34) : sous `for update` sur la ligne de la cible, v(n+1) ne s'écrit que si la
//   dernière est encore vn. Sinon « dépassée » : une tâche s'arrête (celle en file refait), une action répond 409.
// - Une version n'est rendue que si le lecteur voit toutes ses entrées sous RLS, et, pour un texte du modèle (écrit
//   par lui, ou restauré d'une de ses versions), si les sessions parmi elles gardent l'usage `resume` (D33).
// - L'état d'un fil est sa dernière version si elle est lisible, sinon l'état déterministe, jamais une plus ancienne.
// - Restaurer écrit une nouvelle version, rien n'est effacé ; seule l'action du site restaure (T55).
// shortcut: l'usage `resume` se lit dans `metadata.usages` des sessions, que la route du retrait vide (faits-routes.ts,
// T43 amendé le 06/11) ; `leon retirer-crochets` l'appelle, et le poste la rappelle plus tard s'il n'a pas pu : d'ici
// là, et pour une connexion d'avant, que le retrait ne joint pas, une version du modèle reste rendue. À revoir avec la
// limite de thread-state-worker.ts.

export type EcritPar = (typeof versionsMemoire.$inferSelect)['ecritPar'];
export type Motif = (typeof versionsMemoire.$inferSelect)['motif'];

// Ce qui a des versions : un fil (D21) ou une note (D38). Jamais la session d'un outil.
export const CIBLES = ['leon_fil', 'mcp_remember'] as const;
// C12, comme le check de 0052.
const TEXTE_MAX = 4000;

export type Version = {
  id: string;
  n: number;
  texte: string;
  entrees: string[];
  ecritPar: EcritPar;
  motif: Motif;
  restaureDe: string | null;
  creeLe: Date;
  // Un texte du modèle, écrit par lui ou restauré d'une de ses versions : la règle `resume` lui vaut (D33).
  duModele: boolean;
};
// `debut` : les premiers caractères du texte, de quoi en tirer la première ligne (C12).
export type VersionInfo = Pick<
  Version,
  'n' | 'ecritPar' | 'motif' | 'creeLe' | 'entrees' | 'duModele'
> & { debut: string };
// Assez pour le titre « Où j'en suis » et 200 caractères de la ligne qui le suit (thread-read.ts).
const DEBUT_CHARS = 600;

export type WriteInput = {
  sourceId: string;
  // Le n de la dernière version lue avant d'écrire, 0 sans version (D34).
  attendue: number;
  texte: string;
  // Des ids de sources seulement, sessions comprises ; les tours ne servent qu'à la provenance.
  entrees: string[];
  tours?: string[];
  ecritPar: EcritPar;
  motif: Motif;
  etape?: string;
  modele?: string;
  outil?: string;
  session?: string;
  restaureDe?: string;
};
// 'gardee' : la liste du serveur n'écrase pas une version lisible du modèle (D33).
export type WriteResult = { n: number } | 'depassee' | 'gardee' | 'introuvable';

// Un compteur, relevé par T38 : une ligne par événement, sans texte ni id.
const count = (evenement: 'ecrite' | 'depassee' | 'restauree') =>
  console.info('[leon]', `versions.${evenement}`);

// `o` : la version d'origine d'un texte restauré.
const FROM = (ctx: TenantContext, sourceId: string) => sql`
  from versions_memoire v left join versions_memoire o on o.id = v.restaure_de
  where v.tenant_id = ${ctx.tenantId} and v.source_id = ${sourceId}`;
const DU_MODELE = sql`coalesce(o.ecrit_par, v.ecrit_par) = 'modele'`;
// La règle de lecture de D33, celle de readAboutSuggestion : sous RLS, une source cachée n'est pas vue. Une origine
// invisible ne dit pas si le texte vient du modèle : la version ne se lit pas.
const LISIBLE = sql`(
  (v.restaure_de is null or o.id is not null)
  and not exists (
    select 1 from unnest(v.entrees) e(id) where not exists (select 1 from sources s where s.id = e.id))
  and (not ${DU_MODELE} or not exists (
    select 1 from sources s
    where s.id = any(v.entrees) and s.kind = any(${textArray(CODE_SESSION_KINDS)})
      and not coalesce(s.metadata->'usages' @> '["resume"]'::jsonb, false))))`;
const COLUMNS = sql`v.id, v.n, v.texte, v.entrees, v.ecrit_par, v.motif, v.restaure_de, v.cree_le,
  ${DU_MODELE} as du_modele`;

type Row = {
  id: string;
  n: number;
  texte: string;
  entrees: string[];
  ecrit_par: EcritPar;
  motif: Motif;
  restaure_de: string | null;
  // Le pilote rend une date en texte à une requête brute.
  cree_le: string;
  du_modele: boolean;
};
const toVersion = (row: Row): Version => ({
  id: row.id,
  n: row.n,
  texte: row.texte,
  entrees: row.entrees,
  ecritPar: row.ecrit_par,
  motif: row.motif,
  restaureDe: row.restaure_de,
  creeLe: new Date(row.cree_le),
  duModele: row.du_modele,
});

async function latest(tx: Tx, ctx: TenantContext, sourceId: string) {
  const { rows } = await tx.execute<Row & { lisible: boolean }>(sql`
    select ${COLUMNS}, ${LISIBLE} as lisible
    ${FROM(ctx, sourceId)}
    order by v.n desc limit 1`);
  return rows[0];
}

async function readable(tx: Tx, ctx: TenantContext, sourceId: string, n: number) {
  const { rows } = await tx.execute<Row>(sql`
    select ${COLUMNS} ${FROM(ctx, sourceId)} and v.n = ${n} and ${LISIBLE}`);
  return rows[0] ? toVersion(rows[0]) : null;
}

// Le verrou d'un fil ou d'une note de l'auteur (D34), toujours dans cet ordre : l'organisation, en FOR KEY SHARE (ce que
// l'insertion d'une version prend par sa clé étrangère), puis la cible. C'est l'ordre des deux suppressions
// (lockMembers prend l'organisation, puis la cascade ou supprimer_fil prend les fils) : la cible d'abord, et l'écriture
// tiendrait le fil en attendant l'organisation que la suppression tient en attendant le fil. Tout verrou d'un fil
// passe par ici, le rangement (T40) et l'état (T43) compris. Rend false si la cible n'est pas à l'auteur, ou partie.
export async function lockTarget(tx: Tx, ctx: TenantContext, sourceId: string): Promise<boolean> {
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId))
    .for('key share');
  if (!organization) return false;
  const [target] = await tx
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.tenantId, ctx.tenantId),
        eq(sources.id, sourceId),
        eq(sources.ownerUserId, ctx.userId),
        inArray(sources.kind, CIBLES),
      ),
    )
    .for('update');
  return target !== undefined;
}

// Écrit v(attendue+1), dans la transaction de l'appelant (T43, T57 et restoreVersion écrivent par elle). La cible est
// un fil ou une note de l'auteur, verrouillée jusqu'à la fin de la transaction.
export async function writeVersion(
  tx: Tx,
  ctx: TenantContext,
  input: WriteInput,
): Promise<WriteResult> {
  if (!(await lockTarget(tx, ctx, input.sourceId))) return 'introuvable';
  // Après le verrou, qu'une suppression du compte prend aussi (deleteAccount) : elle est validée ou pas commencée.
  // Un compte supprimé n'écrit plus, sa note restée comprise.
  const [author] = await tx
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, ctx.userId));
  if (!author || author.deletedAt) return 'introuvable';
  const last = await latest(tx, ctx, input.sourceId);
  if ((last?.n ?? 0) !== input.attendue) {
    count('depassee');
    return 'depassee';
  }
  if (input.ecritPar === 'serveur' && last?.du_modele && last.lisible) return 'gardee';
  const n = input.attendue + 1;
  await tx.insert(versionsMemoire).values({
    tenantId: ctx.tenantId,
    ownerUserId: ctx.userId,
    sourceId: input.sourceId,
    n,
    // Le masque peut allonger le texte : la borne se réapplique après, comme pour les faits.
    texte: factText(input.texte, TEXTE_MAX),
    entrees: input.entrees,
    tours: input.tours ?? [],
    ecritPar: input.ecritPar,
    motif: input.motif,
    etape: input.etape,
    modele: input.modele,
    outil: input.outil,
    session: input.session,
    restaureDe: input.restaureDe,
    acl: [ctx.userId],
  });
  count('ecrite');
  return { n };
}

// Une version, si elle est lisible ; même ancienne, elle reste accessible (D33).
export async function readVersion(
  ctx: TenantContext,
  sourceId: string,
  n: number,
): Promise<Version | null> {
  return withTenant(ctx, (tx) => readable(tx, ctx, sourceId, n));
}

// L'historique : les versions lisibles, de la plus ancienne à la plus récente.
export async function listVersions(ctx: TenantContext, sourceId: string): Promise<VersionInfo[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<
      Pick<Row, 'n' | 'ecrit_par' | 'motif' | 'cree_le' | 'entrees' | 'du_modele'> & {
        debut: string;
      }
    >(sql`
      select v.n, v.ecrit_par, v.motif, v.cree_le, v.entrees, ${DU_MODELE} as du_modele,
        left(v.texte, ${DEBUT_CHARS}) as debut
      ${FROM(ctx, sourceId)} and ${LISIBLE}
      order by v.n`),
  );
  return rows.map((row) => ({
    n: row.n,
    ecritPar: row.ecrit_par,
    motif: row.motif,
    creeLe: new Date(row.cree_le),
    entrees: row.entrees,
    duModele: row.du_modele,
    debut: row.debut,
  }));
}

// La lecture de l'état : `n`, le numéro de la dernière version (0 sans version), que l'écriture suivante attend ;
// `version`, elle-même si elle est lisible. Sinon null : l'appelant rend l'état déterministe (T43, T44), jamais une
// version plus ancienne (D33).
export async function readLatest(
  ctx: TenantContext,
  sourceId: string,
): Promise<{ n: number; version: Version | null }> {
  return withTenant(ctx, (tx) => latestIn(tx, ctx, sourceId));
}

// La même lecture, dans la transaction de l'appelant : la lecture commune lit le fil et son état d'un seul coup.
export async function latestIn(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
): Promise<{ n: number; version: Version | null }> {
  const last = await latest(tx, ctx, sourceId);
  return { n: last?.n ?? 0, version: last?.lisible ? toVersion(last) : null };
}

// Remet la version n, si elle est lisible et que la dernière est encore `depuis` : v(depuis+1), écrite par l'humain,
// avec son texte et ses entrées. Seule l'action du site l'appelle (T55) ; une note passera par writeNote (T57).
// `restaure_de` pointe vers le texte d'origine : une version du modèle restaurée suit ses règles (D33).
export async function restoreVersion(
  ctx: TenantContext,
  input: { sourceId: string; n: number; depuis: number },
): Promise<WriteResult | 'illisible'> {
  return withTenant(ctx, async (tx) => {
    const chosen = await readable(tx, ctx, input.sourceId, input.n);
    if (!chosen) return 'illisible';
    const written = await writeVersion(tx, ctx, {
      sourceId: input.sourceId,
      attendue: input.depuis,
      texte: chosen.texte,
      entrees: chosen.entrees,
      ecritPar: 'humain',
      motif: 'restauration',
      restaureDe: chosen.restaureDe ?? chosen.id,
    });
    if (typeof written === 'object') count('restauree');
    return written;
  });
}
