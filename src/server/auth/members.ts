import { createHash, randomBytes } from 'node:crypto';
import { type AnyColumn, and, asc, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { members, organizations, users } from '@/server/db/schema/auth';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import type { ValidPlacement } from './onboarding';
import type { TenantContext } from './tenant-context';

// Les membres d'une organisation, et l'ajout d'un membre par un lien d'invitation (0033) : un propriétaire ou un
// administrateur crée le lien et l'envoie lui-même. Le lien sert une fois, avant son expiration.

export const INVITATION_DAYS = 7;
const DAY_MS = 86_400_000;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  former: boolean;
  department: string | null;
  job: string | null;
  seniority: number | null;
};

const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Better Auth peut ranger plusieurs rôles séparés par des virgules (comme connections.ts).
const isAdminRole = (role: SQL | AnyColumn) =>
  sql`string_to_array(${role}, ',') && array['owner', 'admin']`;

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
  return db
    .select({
      id: members.id,
      name: users.name,
      // Un ancien membre (supprimé, 0040) reste dans la liste sous son nom, sans l'adresse qu'on lui a substituée.
      email: sql<string>`case when ${users.deletedAt} is null then ${users.email} else '' end`,
      role: members.role,
      former: sql<boolean>`${users.deletedAt} is not null`,
      department: sql<string | null>`case when ${mayReadPlacement} then ${members.department} end`,
      job: sql<string | null>`case when ${mayReadPlacement} then ${members.job} end`,
      seniority: sql<number | null>`case when ${mayReadPlacement} then ${members.seniority} end`,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, ctx.tenantId))
    .orderBy(asc(members.createdAt), asc(members.id));
}

// La place du lecteur dans son organisation, pour l'en-tête du profil ; null s'il n'en est plus membre.
export async function getMembership(
  ctx: TenantContext,
): Promise<{ role: string; organizationName: string; since: Date } | null> {
  const [row] = await db
    .select({ role: members.role, organizationName: organizations.name, since: members.createdAt })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
    .limit(1);
  return row ?? null;
}

// Le lien en clair n'est renvoyé qu'ici, une seule fois ; null si le lecteur n'est ni propriétaire ni administrateur.
// Il porte le poste de l'invité (recopié sur le membre à son arrivée) et le nom saisi pour s'y retrouver (vide = nul).
export async function createInvitationLink(
  ctx: TenantContext,
  invite: { name: string; placement: ValidPlacement },
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!(await canInvite(ctx))) return null;
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
  });
  return { token, expiresAt };
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
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(invitationLinks)
      .set({ usedAt: sql`now()` })
      .where(usable(token))
      .returning({
        tenantId: invitationLinks.tenantId,
        department: invitationLinks.department,
        job: invitationLinks.job,
        seniority: invitationLinks.seniority,
      });
    if (!link) return null;
    // Le poste du lien suit l'invité ; un lien d'avant 0044 n'en a pas, et fait entrer quand même.
    await tx.insert(members).values({
      organizationId: link.tenantId,
      userId,
      role: 'member',
      createdAt: new Date(),
      department: link.department,
      job: link.job,
      seniority: link.seniority,
    });
    return link.tenantId;
  });
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
    .returning({ id: members.id });
  return done.length > 0;
}
