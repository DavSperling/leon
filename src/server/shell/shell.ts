import { type AnyColumn, and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';
import { fold } from '@/lib/verre/text';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { sources } from '@/server/db/schema/memory';
import { discussions } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';

// Ce que l'ossature lit pour elle-même : la barre latérale (à chaque rendu du layout) et la barre de commande (à la
// frappe). Des requêtes courtes, quelques colonnes, une seule transaction par lecture (le pool est petit), toujours
// sous les droits de la personne : ses discussions à elle, les documents que la base lui montre, les membres présents.

export const SHELL_RECENTS = 5;
export const SHELL_FOUND_MAX = 5;

export type SidebarData = {
  /** La photo du compte, quand il en a une. */
  image: string | null;
  /** Ses cinq dernières discussions, la plus récente d'abord. */
  recents: { id: string; title: string }[];
  /** Les outils à reconnecter, un par outil, le plus ancien d'abord. */
  reconnect: ProviderId[];
};

// Un outil est « à reconnecter » pour qui peut le faire, comme la pastille « Reconnecter » de sa carte sur Connexions :
// la personne a branché une connexion qui est en erreur. La connexion en panne d'un collègue, ou arrêtée (son auteur a
// quitté l'espace), ne suit pas les autres sur tous les écrans : seul son auteur peut la reconnecter.
export async function readSidebar(ctx: TenantContext): Promise<SidebarData> {
  return withTenant(ctx, async (tx) => {
    const recents = await tx
      .select({ id: discussions.id, title: discussions.title })
      .from(discussions)
      .where(eq(discussions.userId, ctx.userId))
      .orderBy(desc(discussions.updatedAt), desc(discussions.id))
      .limit(SHELL_RECENTS);
    const broken = await tx
      .select({ provider: connections.provider })
      .from(connections)
      .where(
        and(
          eq(connections.tenantId, ctx.tenantId),
          eq(connections.createdBy, ctx.userId),
          eq(connections.status, 'error'),
        ),
      )
      .groupBy(connections.provider)
      .orderBy(sql`min(${connections.createdAt})`, asc(connections.provider));
    const [me] = await tx
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, ctx.userId));
    return {
      image: me?.image ?? null,
      recents,
      reconnect: broken.map((row) => row.provider),
    };
  });
}

export type ShellFound = {
  /** `state` : comme la carte de l'outil sur Connexions ; une connexion en erreur ou arrêtée l'emporte, puis « en pause »
   * quand toutes le sont. */
  tools: { id: ProviderId; label: string; state: 'connected' | 'paused' | 'broken' | null }[];
  /** `id` : celui du membre, que l'écran Équipe attend (?personne=). */
  people: { id: string; name: string; image: string | null }[];
  documents: { id: string; title: string; private: boolean }[];
  discussions: { id: string; title: string }[];
};

export const NOTHING_FOUND: ShellFound = { tools: [], people: [], documents: [], discussions: [] };

// Sans casse ni accent, des deux côtés : la requête passe par fold(), la colonne par translate() (pas d'extension
// unaccent sur la base). Les caractères joker de LIKE tapés par la personne sont pris pour ce qu'ils sont.
const ACCENTS = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
const PLAIN = 'aaaaaaceeeeiiiinooooouuuuyy';
const folded = (column: AnyColumn) => sql`translate(lower(${column}), ${ACCENTS}, ${PLAIN})`;

// Ce que la barre de commande trouve pour quelques lettres : cinq par groupe au plus, les noms qui commencent par ces
// lettres d'abord. Un outil vient du catalogue (les 42 outils branchables) ; son état se lit sous les droits de la
// personne, comme sa carte sur Connexions : en panne si l'une de ses connexions est en erreur ou arrêtée, en pause si
// toutes le sont.
export async function searchShell(ctx: TenantContext, query: string): Promise<ShellFound> {
  const q = fold(query).trim().slice(0, 100);
  if (q === '') return NOTHING_FOUND;
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const has = (column: AnyColumn) => sql`${folded(column)} like ${`%${escaped}%`}`;
  const starts = (column: AnyColumn) => sql`${folded(column)} like ${`${escaped}%`}`;
  const tools = PROVIDER_IDS.map((id) => ({ id, label: PROVIDER_LABELS[id] }))
    .filter((tool) => fold(tool.label).includes(q))
    .sort(
      (a, b) =>
        Number(fold(b.label).startsWith(q)) - Number(fold(a.label).startsWith(q)) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, SHELL_FOUND_MAX);
  return withTenant(ctx, async (tx) => {
    const states =
      tools.length === 0
        ? []
        : await tx
            .select({
              provider: connections.provider,
              broken: sql<boolean>`bool_or(${connections.status} = 'error' or not exists (
                select 1 from member
                where "userId" = ${connections.createdBy} and "organizationId" = ${connections.tenantId}))`,
              paused: sql<boolean>`bool_and(${connections.status} = 'paused')`,
            })
            .from(connections)
            .where(
              and(
                eq(connections.tenantId, ctx.tenantId),
                inArray(
                  connections.provider,
                  tools.map((tool) => tool.id),
                ),
              ),
            )
            .groupBy(connections.provider);
    const stateOf = new Map(
      states.map((row) => [
        row.provider,
        row.broken
          ? ('broken' as const)
          : row.paused
            ? ('paused' as const)
            : ('connected' as const),
      ]),
    );
    const people = await tx
      .select({ id: members.id, name: users.name, image: users.image })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(eq(members.organizationId, ctx.tenantId), isNull(users.deletedAt), has(users.name)),
      )
      .orderBy(desc(starts(users.name)), asc(users.name), asc(members.id))
      .limit(SHELL_FOUND_MAX);
    const documents = await tx
      .select({
        id: sources.id,
        title: sql<string>`${sources.title}`,
        private: sql<boolean>`${sources.acl} = array[${sources.ownerUserId}]`,
      })
      .from(sources)
      .where(
        and(eq(sources.tenantId, ctx.tenantId), eq(sources.kind, 'document'), has(sources.title)),
      )
      .orderBy(desc(starts(sources.title)), desc(sources.createdAt), asc(sources.id))
      .limit(SHELL_FOUND_MAX);
    const found = await tx
      .select({ id: discussions.id, title: discussions.title })
      .from(discussions)
      .where(and(eq(discussions.userId, ctx.userId), has(discussions.title)))
      .orderBy(desc(starts(discussions.title)), desc(discussions.updatedAt), desc(discussions.id))
      .limit(SHELL_FOUND_MAX);
    return {
      tools: tools.map((tool) => ({ ...tool, state: stateOf.get(tool.id) ?? null })),
      people,
      documents,
      discussions: found,
    };
  });
}
