import { createHash, randomBytes } from 'node:crypto';
import { type AnyColumn, and, asc, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { markBriefingsStale } from '@/server/briefing/about';
import { db } from '@/server/db/client';
import { members, organizations, users } from '@/server/db/schema/auth';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import { reportingLines } from '@/server/db/schema/organisation';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import type { ValidPlacement } from './onboarding';
import { resolveTenantContext, type TenantContext } from './tenant-context';

// Les membres d'une organisation, et l'ajout d'un membre par un lien d'invitation (0033) : un propriétaire ou un
// administrateur crée le lien et l'envoie lui-même. Le lien sert une fois, avant son expiration.

export const INVITATION_DAYS = 7;
const DAY_MS = 86_400_000;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  former: boolean;
  department: string | null;
  job: string | null;
  seniority: number | null;
  /** La ligne du lecteur lui-même. */
  self: boolean;
  managerId: string | null; // membre auquel il est rattaché (0054)
};

const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Better Auth peut ranger plusieurs rôles séparés par des virgules (comme connections.ts).
// Un propriétaire ou un administrateur invite, rattache à un manager, change un rôle et retire un membre.
const isAdminRole = (role: SQL | AnyColumn) =>
  sql`string_to_array(${role}, ',') && array['owner', 'admin']`;
// Un propriétaire ne se rétrograde ni ne se retire depuis l'écran : l'espace en garde toujours un.
const notOwner = sql`not (string_to_array(${members.role}, ',') && array['owner'])`;

// Le lecteur `userId` est propriétaire ou administrateur de l'organisation `tenantId` : la condition SQL de ce qu'un
// administrateur peut écrire (le poste d'un membre) et lire (le poste de tous), et de la validité d'un lien.
const isAdminOf = (userId: SQL | AnyColumn | string, tenantId: SQL | AnyColumn | string) =>
  sql`exists (
    select 1 from member m
    where m."userId" = ${userId} and m."organizationId" = ${tenantId}
      and ${isAdminRole(sql`m.role`)})`;

export async function canInvite(ctx: TenantContext): Promise<boolean> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, ctx.userId),
        eq(members.organizationId, ctx.tenantId),
        isAdminRole(members.role),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Le poste (service, poste, niveau) ne se lit que d'un propriétaire ou d'un administrateur : pour un simple membre il
// vaut null sur chaque ligne, la sienne comprise. La condition est dans le SQL, comme celle de l'écriture.
export async function listMembers(ctx: TenantContext): Promise<MemberRow[]> {
  const mayReadPlacement = isAdminOf(ctx.userId, ctx.tenantId);
  // Sous RLS : reporting_lines n'est lisible que dans l'organisation du lecteur.
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: members.id,
        userId: members.userId,
        name: users.name,
        // Un ancien membre (supprimé, 0040) reste dans la liste sous son nom, sans l'adresse qu'on lui a substituée.
        email: sql<string>`case when ${users.deletedAt} is null then ${users.email} else '' end`,
        role: members.role,
        former: sql<boolean>`${users.deletedAt} is not null`,
        department: sql<
          string | null
        >`case when ${mayReadPlacement} then ${members.department} end`,
        job: sql<string | null>`case when ${mayReadPlacement} then ${members.job} end`,
        seniority: sql<number | null>`case when ${mayReadPlacement} then ${members.seniority} end`,
        self: sql<boolean>`${members.userId} = ${ctx.userId}`,
        managerId: reportingLines.managerId,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(reportingLines, eq(reportingLines.memberId, members.id))
      .where(eq(members.organizationId, ctx.tenantId))
      .orderBy(asc(members.createdAt), asc(members.id)),
  );
}

// Membre ou administrateur, jamais propriétaire ; false si le lecteur n'a pas le droit ou si la cible est propriétaire.
export async function setMemberRole(
  ctx: TenantContext,
  memberId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  if (!z.uuid().safeParse(memberId).success || !(await canInvite(ctx))) return false;
  const rows = await db
    .update(members)
    .set({ role })
    .where(and(eq(members.id, memberId), eq(members.organizationId, ctx.tenantId), notOwner))
    .returning({ id: members.id });
  return rows.length > 0;
}
// Retire un membre de l'organisation : sa session, ses jetons et ses connexions s'arrêtent à la requête suivante
// (tous revérifient l'adhésion), ses rattachements partent en cascade. Ce qu'il a déjà fait entrer dans Leon reste.
// Ni soi-même, ni un propriétaire.
export async function removeMember(ctx: TenantContext, memberId: string): Promise<boolean> {
  if (!z.uuid().safeParse(memberId).success || !(await canInvite(ctx))) return false;
  const rows = await db
    .delete(members)
    .where(
      and(
        eq(members.id, memberId),
        eq(members.organizationId, ctx.tenantId),
        sql`${members.userId} <> ${ctx.userId}`,
        notOwner,
      ),
    )
    .returning({ id: members.id });
  return rows.length > 0;
}

// La place du lecteur dans son organisation, pour l'en-tête du profil ; null s'il n'en est plus membre.
export async function getMembership(
  ctx: TenantContext,
): Promise<{ role: string; organizationName: string; since: Date } | null> {
  const [row] = await db
    .select({
      role: members.role,
      organizationName: organizations.name,
      since: members.createdAt,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
    .limit(1);
  return row ?? null;
}

// Le lien en clair n'est renvoyé qu'ici, une seule fois ; null si le lecteur n'est ni propriétaire ni administrateur,
// ou si le manager choisi n'est pas un membre de son organisation. Il porte le poste de l'invité et son manager
// (appliqués à son arrivée), et le nom saisi pour s'y retrouver (vide = nul).
export async function createInvitationLink(
  ctx: TenantContext,
  invite: { name: string; placement: ValidPlacement; managerId?: string | null },
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!(await canInvite(ctx))) return null;
  const managerId = invite.managerId ?? null;
  if (managerId !== null && !(await isMemberOf(ctx, managerId))) return null;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * DAY_MS);
  await db.insert(invitationLinks).values({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    tokenHash: hashInvitationToken(token),
    expiresAt,
    inviteeName: invite.name.trim() || null,
    department: invite.placement.department,
    job: invite.placement.job,
    seniority: invite.placement.seniority,
    managerId,
  });
  return { token, expiresAt };
}

// Un membre présent (pas un ancien) de l'organisation du lecteur.
async function isMemberOf(ctx: TenantContext, memberId: string): Promise<boolean> {
  if (!z.uuid().safeParse(memberId).success) return false;
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.id, memberId),
        eq(members.organizationId, ctx.tenantId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Pas encore servi, pas expiré, et son auteur est toujours propriétaire ou administrateur de l'organisation : le
// lien d'un administrateur parti ou rétrogradé ne fait plus entrer personne.
const usable = (token: string) =>
  and(
    eq(invitationLinks.tokenHash, hashInvitationToken(token)),
    isNull(invitationLinks.usedAt),
    sql`${invitationLinks.expiresAt} > now()`,
    isAdminOf(invitationLinks.createdBy, invitationLinks.tenantId),
  );

// Le nom de l'organisation d'un lien encore utilisable ; null sinon.
export async function findInvitation(token: string): Promise<{ organizationName: string } | null> {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
  const [row] = await db
    .select({ organizationName: organizations.name })
    .from(invitationLinks)
    .innerJoin(organizations, eq(organizations.id, invitationLinks.tenantId))
    .where(usable(token))
    .limit(1);
  return row ?? null;
}

// Sert le lien et fait de l'utilisateur un membre, dans la même transaction. Rend l'organisation, ou null si le
// lien n'est plus utilisable : de deux inscriptions simultanées, la seconde attend la première et ne trouve plus
// de lien à servir.
export async function joinWithInvitation(token: string, userId: string): Promise<string | null> {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
  const joined = await db.transaction(async (tx) => {
    const [link] = await tx
      .update(invitationLinks)
      // Le nom saisi pour s'y retrouver ne sert plus une fois le lien utilisé : on ne le garde pas.
      .set({ usedAt: sql`now()`, inviteeName: null })
      .where(usable(token))
      .returning({
        tenantId: invitationLinks.tenantId,
        department: invitationLinks.department,
        job: invitationLinks.job,
        seniority: invitationLinks.seniority,
        managerId: invitationLinks.managerId,
        createdBy: invitationLinks.createdBy,
      });
    if (!link) return null;
    // Le poste du lien suit l'invité ; un lien d'avant 0044 n'en a pas, et fait entrer quand même.
    const [member] = await tx
      .insert(members)
      .values({
        organizationId: link.tenantId,
        userId,
        role: 'member',
        createdAt: new Date(),
        department: link.department,
        job: link.job,
        seniority: link.seniority,
        // Placé à la main par qui l'a invité : l'import de l'annuaire n'y touchera pas, comme setManager.
        rattachementManuel: link.managerId !== null,
      })
      .returning({ id: members.id });
    return member ? { ...link, memberId: member.id } : null;
  });
  if (!joined) return null;
  // Son manager (0065) ; parti depuis, la clé est revenue à null. Personne n'est encore sous l'invité : pas de boucle.
  // Écrit au nom de qui a créé le lien, administrateur (`usable` l'a vérifié) : la RLS de l'organigramme (0057) l'exige.
  // Après l'entrée : un échec laisse l'invité dans l'organisation, pas encore placé.
  if (joined.managerId) {
    try {
      const creator = await resolveTenantContext(joined.createdBy, joined.tenantId);
      const managerId = joined.managerId;
      if (creator)
        await withTenant(creator, (tx) =>
          tx
            .insert(reportingLines)
            .values({ tenantId: joined.tenantId, memberId: joined.memberId, managerId }),
        );
    } catch (error) {
      logError('team.invitation_manager_failed', error, { tenantId: joined.tenantId });
    }
  }
  return joined.tenantId;
}

// Un administrateur (ou propriétaire) fixe le poste d'un membre de son organisation, le sien compris. La condition est
// dans le SQL : un membre n'écrit jamais le sien, ni celui d'un autre. Ne touche ni au rôle ni aux attentes. Vrai si
// une ligne a changé.
export async function setMemberPlacement(
  ctx: TenantContext,
  memberId: string,
  placement: ValidPlacement,
): Promise<boolean> {
  const done = await db
    .update(members)
    .set({
      department: placement.department,
      job: placement.job,
      seniority: placement.seniority,
    })
    .where(
      and(
        eq(members.id, memberId),
        eq(members.organizationId, ctx.tenantId),
        isAdminOf(ctx.userId, ctx.tenantId),
      ),
    )
    .returning({ userId: members.userId });
  const [changed] = done;
  if (!changed) return false;
  // Le poste change ce que le point du matin retient : les points de cette personne se refont, sous ses droits (la RLS
  // ne laisse marquer que les siens). Il est déjà enregistré : un échec ne remonte pas.
  try {
    const person = await resolveTenantContext(changed.userId, ctx.tenantId);
    if (person) await markBriefingsStale(person);
  } catch (error) {
    logError('briefing.mark_stale_failed', error, {
      tenantId: ctx.tenantId,
      userId: changed.userId,
    });
  }
  return true;
}

export type PendingInvitation = {
  id: string;
  name: string | null;
  department: string | null;
  job: string | null;
  seniority: number | null;
  managerId: string | null;
  expiresAt: Date;
};

// Les liens encore utilisables de l'organisation (écran Équipe : « Invité ») ; pour un propriétaire ou un
// administrateur seulement, sinon aucun. Le lien lui-même ne se relit jamais : seule son empreinte est gardée.
export async function listInvitations(ctx: TenantContext): Promise<PendingInvitation[]> {
  if (!(await canInvite(ctx))) return [];
  return db
    .select({
      id: invitationLinks.id,
      name: invitationLinks.inviteeName,
      department: invitationLinks.department,
      job: invitationLinks.job,
      seniority: invitationLinks.seniority,
      managerId: invitationLinks.managerId,
      expiresAt: invitationLinks.expiresAt,
    })
    .from(invitationLinks)
    .where(
      and(
        eq(invitationLinks.tenantId, ctx.tenantId),
        isNull(invitationLinks.usedAt),
        sql`${invitationLinks.expiresAt} > now()`,
        isAdminOf(invitationLinks.createdBy, invitationLinks.tenantId),
      ),
    )
    .orderBy(asc(invitationLinks.createdAt), asc(invitationLinks.id));
}

// Annule un lien pas encore servi : il expire maintenant, plus personne n'entre avec (l'application ne supprime pas
// de lien : la table le lui interdit). Réservé aux propriétaires et administrateurs.
export async function cancelInvitation(ctx: TenantContext, id: string): Promise<boolean> {
  if (!z.uuid().safeParse(id).success || !(await canInvite(ctx))) return false;
  const rows = await db
    .update(invitationLinks)
    .set({ expiresAt: sql`now()`, inviteeName: null })
    .where(
      and(
        eq(invitationLinks.id, id),
        eq(invitationLinks.tenantId, ctx.tenantId),
        isNull(invitationLinks.usedAt),
        sql`${invitationLinks.expiresAt} > now()`,
      ),
    )
    .returning({ id: invitationLinks.id });
  return rows.length > 0;
}

// Un lien encore utilisable de l'organisation du lecteur, qui peut inviter : ce que l'e-mail d'invitation dit (le nom
// de l'organisation, l'expiration). null sinon : un lien d'ailleurs, servi ou expiré ne part pas par Leon.
export async function invitationToSend(
  ctx: TenantContext,
  token: string,
): Promise<{ organizationName: string; expiresAt: Date } | null> {
  if (!INVITATION_TOKEN_PATTERN.test(token) || !(await canInvite(ctx))) return null;
  const [row] = await db
    .select({ organizationName: organizations.name, expiresAt: invitationLinks.expiresAt })
    .from(invitationLinks)
    .innerJoin(organizations, eq(organizations.id, invitationLinks.tenantId))
    .where(and(usable(token), eq(invitationLinks.tenantId, ctx.tenantId)))
    .limit(1);
  return row ?? null;
}
