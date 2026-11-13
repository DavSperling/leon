import { and, asc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, organizations, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import { lecons, versionsMemoire } from '@/server/db/schema/memory';
import { aboutSuggestions } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { TenantContext } from './tenant-context';

// Supprimer son compte (0040) : la personne part, pas son travail. La ligne `user` reste, vidée et verrouillée, car
// ses sources en dépendent (clé étrangère en cascade) ; le seul membre actif, lui, emporte l'organisation. Tout se
// fait en base dans une seule transaction ; Pipedream et les e-mails, après, sont l'affaire de l'appelant.
//
// Un membre actif est une adhésion dont l'utilisateur n'a pas de `deleted_at` : partout où l'on compte ou liste
// les membres pour décider, on ne compte que ceux-là.

// Une adresse qui ne mène nulle part et ne peut pas servir à se connecter ni à recevoir un lien.
export const formerEmail = (userId: string) => `ancien-${userId}@leon.invalid`;

export type DeletionInfo = {
  organizationName: string;
  isOwner: boolean; // propriétaire actif de l'organisation courante
  soleActiveMember: boolean; // supprimer le compte supprimera l'organisation
  needsSuccessor: boolean; // seul propriétaire actif, avec d'autres membres actifs
  successors: { userId: string; name: string }[]; // les autres membres actifs, par ancienneté
  activeMembers: number;
};

export type DeletionRefusal =
  | 'successeur'
  | 'autre_organisation'
  | 'pas_proprietaire'
  | 'situation';

export class DeletionRefused extends Error {
  override name = 'DeletionRefused';
  constructor(readonly reason: DeletionRefusal) {
    super(`Suppression refusée : ${reason}`);
  }
}

export type DeletionResult = {
  organizationDeleted: boolean;
  organizationName: string;
  notify: { email: string; kind: 'account' | 'organization' }[]; // adresses d'origine, relevées avant
  pipedreamUsers: string[]; // `config.externalUserId` des connexions Pipedream effacées
};

// Better Auth peut ranger plusieurs rôles séparés par des virgules (comme members.ts).
const isOwnerRole = (role: string) => role.split(',').includes('owner');

// Verrouille les liens d'invitation, l'organisation, puis ses adhésions, anciennes comprises : deux suppressions
// simultanées passent l'une après l'autre, et la seconde relit les rôles que la première a laissés. Sans cela, deux
// propriétaires qui partent ensemble verraient chacun l'autre en place et laisseraient l'organisation sans
// propriétaire. La ligne de l'organisation fait attendre l'adhésion qu'une invitation acceptée au même instant est en
// train d'ajouter ; les liens passent avant, dans l'ordre de `joinWithInvitation` (le lien, puis le membre), pour que
// les deux ne s'attendent pas l'un l'autre.
async function lockMembers(tx: Tx, tenantId: string): Promise<void> {
  await tx
    .select({ id: invitationLinks.id })
    .from(invitationLinks)
    .where(eq(invitationLinks.tenantId, tenantId))
    .orderBy(asc(invitationLinks.id))
    .for('update');
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, tenantId))
    .for('update');
  await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, tenantId))
    .orderBy(asc(members.id))
    .for('update');
}

async function readState(tx: Tx, ctx: TenantContext) {
  const [organization] = await tx
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId));
  if (!organization) throw new Error('Organisation introuvable');
  const active = await tx
    .select({ userId: members.userId, name: users.name, email: users.email, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, ctx.tenantId), isNull(users.deletedAt)))
    .orderBy(asc(members.createdAt), asc(members.id));
  const me = active.find((member) => member.userId === ctx.userId);
  const isOwner = me !== undefined && isOwnerRole(me.role);
  const soleOwner = isOwner && active.filter((member) => isOwnerRole(member.role)).length === 1;
  return {
    organizationName: organization.name,
    active,
    me,
    isOwner,
    soleActiveMember: me !== undefined && active.length === 1,
    needsSuccessor: soleOwner && active.length > 1,
    successors: active
      .filter((member) => member.userId !== ctx.userId)
      .map(({ userId, name }) => ({ userId, name })),
  };
}
type State = Awaited<ReturnType<typeof readState>>;

export async function deletionInfo(ctx: TenantContext): Promise<DeletionInfo> {
  const state = await withTenant(ctx, (tx) => readState(tx, ctx));
  return {
    organizationName: state.organizationName,
    isOwner: state.isOwner,
    soleActiveMember: state.soleActiveMember,
    needsSuccessor: state.needsSuccessor,
    successors: state.successors,
    activeMembers: state.active.length,
  };
}

// Les utilisateurs Pipedream des connexions choisies : Pipedream garde les jetons chez lui, il faut le prévenir.
async function pipedreamUsersOf(tx: Tx, where: SQL | undefined): Promise<string[]> {
  const rows = await tx
    .select({ id: sql<string | null>`${connections.config}->>'externalUserId'` })
    .from(connections)
    .where(and(where, sql`${connections.config}->>'authMode' = 'pipedream'`));
  return rows.flatMap(({ id }) => (id ? [id] : []));
}

async function removeOrganization(
  tx: Tx,
  ctx: TenantContext,
  state: State,
): Promise<DeletionResult> {
  if (!state.isOwner) throw new DeletionRefused('pas_proprietaire');
  const pipedreamUsers = await pipedreamUsersOf(tx, eq(connections.tenantId, ctx.tenantId));
  // Un compte qui appartient aussi à une autre organisation reste ; les autres, anciens membres compris, ne
  // mèneraient plus à rien.
  const { rows } = await tx.execute<{ userId: string }>(sql`
    select m."userId" as "userId" from member m
    where m."organizationId" = ${ctx.tenantId}
      and not exists (
        select 1 from member o where o."userId" = m."userId" and o."organizationId" <> ${ctx.tenantId})`);
  // Toute sa mémoire part en cascade avec la ligne `organization`.
  await tx.delete(organizations).where(eq(organizations.id, ctx.tenantId));
  const gone = new Set(rows.map((row) => row.userId));
  if (gone.size > 0) await tx.delete(users).where(inArray(users.id, [...gone]));
  return {
    organizationDeleted: true,
    organizationName: state.organizationName,
    // Qui garde son compte (membre ailleurs, l'appelant compris) apprend la suppression de l'organisation, pas du compte.
    notify: state.active.map((member) => ({
      email: member.email,
      kind: member.userId === ctx.userId && gone.has(member.userId) ? 'account' : 'organization',
    })),
    pipedreamUsers,
  };
}

// `successorId` ne sert qu'au seul propriétaire actif d'une organisation qui garde d'autres membres actifs.
// `organizationToo` est ce que le dialogue a annoncé (`soleActiveMember`) : si l'équipe a changé depuis, rien ne part.
export async function deleteAccount(
  ctx: TenantContext,
  successorId: string | null,
  organizationToo: boolean,
): Promise<DeletionResult> {
  return withTenant(ctx, async (tx) => {
    // L'organisation d'abord, puis ses leçons et ses fils (supprimer_fil) : l'ordre de writeVersion (lockTarget). Une
    // version en cours est validée avant et part avec les autres ; celle qui attend voit ensuite le compte supprimé.
    await lockMembers(tx, ctx.tenantId);
    const state = await readState(tx, ctx);
    if (!state.me) throw new Error('Membre actif introuvable');

    // Un compte n'a qu'une organisation en pratique ; ses connexions ailleurs resteraient sinon actives.
    const [elsewhere] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.userId, ctx.userId), ne(members.organizationId, ctx.tenantId)))
      .limit(1);
    if (elsewhere) throw new DeletionRefused('autre_organisation');

    if (state.soleActiveMember !== organizationToo) throw new DeletionRefused('situation');
    if (state.soleActiveMember) return removeOrganization(tx, ctx, state);

    if (state.needsSuccessor) {
      const successor = state.successors.find((member) => member.userId === successorId);
      if (!successor) throw new DeletionRefused('successeur');
      await tx
        .update(members)
        .set({ role: 'owner' })
        .where(and(eq(members.organizationId, ctx.tenantId), eq(members.userId, successor.userId)));
    }

    const pipedreamUsers = await pipedreamUsersOf(
      tx,
      and(eq(connections.tenantId, ctx.tenantId), eq(connections.createdBy, ctx.userId)),
    );
    const now = sql`now()`;
    await tx
      .update(users)
      .set({
        deletedAt: now,
        email: formerEmail(ctx.userId),
        emailVerified: false,
        image: null,
        about: null,
        twoFactorEnabled: false,
        updatedAt: now,
      })
      .where(eq(users.id, ctx.userId));
    // La proposition « About you » est écrite d'après ses sources : elle part avec son « À propos ».
    await tx.delete(aboutSuggestions).where(eq(aboutSuggestions.userId, ctx.userId));
    // Ses versions (C12) : ses sources restent, pas ce qui a été écrit d'après elles.
    await tx.delete(versionsMemoire).where(eq(versionsMemoire.ownerUserId, ctx.userId));
    // Ses notes, écrites par ses agents (D38, A12), partent avec elle ; l'app ne supprime pas de source :
    // supprimer_notes_du_compte (0067) le fait, bornée à ses notes dans cette organisation.
    await tx.execute(sql`select supprimer_notes_du_compte()`);
    // Ses leçons, privées et tirées de sa mémoire (C13) ; leurs lectures partent en cascade.
    await tx.delete(lecons).where(eq(lecons.ownerUserId, ctx.userId));
    // Ses fils de travail, tirés de sa mémoire et privés, partent avec elle (D21) ; ses sessions restent, invisibles.
    // L'app ne supprime pas de source : supprimer_fil (0051) le fait, borné à ses fils.
    await tx.execute(sql`
      select supprimer_fil(id) from sources
      where tenant_id = ${ctx.tenantId} and kind = 'leon_fil' and owner_user_id = ${ctx.userId}`);
    await tx.update(members).set({ role: 'member' }).where(eq(members.userId, ctx.userId));

    // Plus de mot de passe, de session, de 2FA, ni de lien de réinitialisation déjà envoyé (sa valeur est l'id).
    await tx.execute(sql`delete from account where "userId" = ${ctx.userId}`);
    await tx.execute(sql`delete from session where "userId" = ${ctx.userId}`);
    await tx.execute(sql`delete from "twoFactor" where "userId" = ${ctx.userId}`);
    await tx.execute(sql`delete from verification where value = ${ctx.userId}`);
    await tx
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(and(eq(apiTokens.userId, ctx.userId), isNull(apiTokens.revokedAt)));
    await tx
      .update(invitationLinks)
      .set({ expiresAt: now })
      .where(
        and(
          eq(invitationLinks.createdBy, ctx.userId),
          isNull(invitationLinks.usedAt),
          sql`${invitationLinks.expiresAt} > now()`,
        ),
      );
    // Leon arrête de relever ses outils ; les sources déjà relevées restent (`connection_id` passe à nul).
    await tx.delete(connections).where(eq(connections.createdBy, ctx.userId));

    return {
      organizationDeleted: false,
      organizationName: state.organizationName,
      notify: [{ email: state.me.email, kind: 'account' }],
      pipedreamUsers,
    };
  });
}

// Réservé au propriétaire actif : tout part, pour tout le monde.
export async function deleteOrganization(ctx: TenantContext): Promise<DeletionResult> {
  return withTenant(ctx, async (tx) => {
    // L'organisation, puis ses fils par la cascade : l'ordre de writeVersion (lockTarget).
    await lockMembers(tx, ctx.tenantId);
    return removeOrganization(tx, ctx, await readState(tx, ctx));
  });
}
