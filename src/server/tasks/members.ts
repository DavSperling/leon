import { and, asc, eq, sql } from 'drizzle-orm';
import { isMember, type TenantContext } from '@/server/auth/tenant-context';
import { members, users } from '@/server/db/schema/auth';
import { withTenant } from '@/server/db/with-tenant';
import { TaskError } from './errors';

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  firstName: string;
};

const wordsOf = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);
const lettersOf = (word: string): string[] => Array.from(word);

// « Jean-Pierre Dupont » → « JD » ; « Élodie » → « ÉL » ; « ? » si le nom est vide.
export function initialsOf(name: string): string {
  const words = wordsOf(name);
  const first = words[0];
  const last = words.at(-1);
  if (!first || !last) return '?';
  const letters =
    words.length > 1 ? [lettersOf(first)[0], lettersOf(last)[0]] : lettersOf(first).slice(0, 2);
  return letters.join('').toUpperCase();
}

export const firstNameOf = (name: string): string => wordsOf(name)[0] ?? '';

const toMember = (row: { id: string; name: string; email: string }): MemberRow => ({
  ...row,
  initials: initialsOf(row.name),
  firstName: firstNameOf(row.name),
});

// Les tables d'authentification n'ont pas de RLS : l'organisation est filtrée ici, par la jointure.
export async function listMembers(ctx: TenantContext): Promise<MemberRow[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.organizationId, ctx.tenantId))
      .orderBy(asc(sql`lower(${users.name})`), asc(users.id)),
  );
  return rows.map(toMember);
}

// Même résultat nul pour un e-mail inconnu et pour celui d'une autre organisation.
export async function findMemberByEmail(
  ctx: TenantContext,
  email: string,
): Promise<MemberRow | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, ctx.tenantId),
          eq(sql`lower(${users.email})`, email.trim().toLowerCase()),
        ),
      )
      .limit(1),
  );
  return row ? toMember(row) : null;
}

// Un assigné est toujours membre de l'organisation. À appeler avant d'ouvrir la transaction :
// isMember prend sa propre connexion, qu'une transaction en cours priverait au pool.
export async function assertMember(
  ctx: TenantContext,
  userId: string | null | undefined,
): Promise<void> {
  if (typeof userId !== 'string') return;
  if (!(await isMember(userId, ctx.tenantId))) {
    throw new TaskError('not_found', 'Membre introuvable.');
  }
}
