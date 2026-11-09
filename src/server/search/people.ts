import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { members, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { withTenant } from '@/server/db/with-tenant';
import { textArray } from './filters-sql';

// Qui est qui (D12 du plan du deuxième jet). On rapproche par l'adresse e-mail et par le nom des membres de
// l'organisation ; sur GitHub et Slack, dont les auteurs n'ont pas d'adresse, par les comptes que chacun y a
// branchés (`authorNames`, T19). Les identifiants que chacun déclarerait à la main (T19) n'existent pas encore.

// Sans casse, sans accent, avec des espaces simples : « Éloïse  Roy » et « eloise roy » se confondent.
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;

// Les adresses et noms que `de:` a trouvés pour ces personnes, et celles dont personne ne porte le nom.
// - une adresse e-mail est prise pour ce qu'elle est (rangée en minuscules) : l'auteur d'un ticket ou d'un
//   mail n'est pas toujours un membre de l'équipe ;
// - un nom désigne les membres de l'organisation dont le nom commence par ces mots ;
// - un nom que personne ne porte est rendu dans `unknown` : on ne devine pas.
// La liste des membres se lit pour l'organisation du lecteur seulement.
export async function resolvePeople(
  ctx: TenantContext,
  people: string[],
): Promise<{
  authorEmails: string[];
  authorNames: { kind: SourceKind; name: string }[];
  unknown: string[];
}> {
  const emails = new Set<string>();
  const unknown: string[] = [];
  const names = people
    .map((person) => person.trim())
    .filter((person) => person !== '')
    .filter((person) => {
      if (!EMAIL.test(person)) return true;
      emails.add(person.toLowerCase());
      return false;
    });
  if (names.length > 0) {
    const team = await db
      .select({ name: users.name, email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.organizationId, ctx.tenantId));
    // shortcut: l'adresse d'un ancien membre n'est plus celle de ses messages relevés (0040), le nom ne mène plus à
    // eux ; à revoir si `de:` doit retrouver le travail d'un membre parti.
    const known = team.map((member) => ({ name: normalize(member.name), email: member.email }));
    for (const person of names) {
      const wanted = normalize(person);
      const found = wanted === '' ? [] : known.filter((member) => member.name.startsWith(wanted));
      for (const member of found) emails.add(member.email.toLowerCase());
      if (found.length === 0) unknown.push(person);
    }
  }
  return { authorEmails: [...emails], authorNames: await toolNames(ctx, [...emails]), unknown };
}

// Les adresses et les noms d'outil du lecteur : de quoi savoir ce qu'il a écrit.
export async function myAddresses(
  ctx: TenantContext,
): Promise<{ emails: string[]; names: { kind: SourceKind; name: string }[] }> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId));
  const emails = row ? [row.email.toLowerCase()] : [];
  return { emails, names: await toolNames(ctx, emails) };
}

// Les noms d'auteur que GitHub et Slack donnent aux personnes de ces adresses : ceux des comptes qu'elles y ont
// branchés, parmi les connexions de l'organisation du lecteur. Une connexion GitHub porte le login ; une connexion
// Slack « pseudo (espace) », avec « équipe:utilisateur » dans `accountKey` (leurs `verify`). Un message Slack est
// signé du pseudo, ou de l'identifiant quand le pseudo manque : les deux comptent.
// shortcut: qui n'a pas branché son propre GitHub ou Slack y reste inconnu ; à revoir avec les identifiants
// déclarés à la main (T19).
export async function toolNames(
  ctx: TenantContext,
  emails: string[],
): Promise<{ kind: SourceKind; name: string }[]> {
  if (emails.length === 0) return [];
  const lowered = emails.map((email) => email.toLowerCase());
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        provider: connections.provider,
        label: connections.label,
        key: sql<string | null>`${connections.config}->>'accountKey'`,
      })
      .from(connections)
      .innerJoin(users, eq(users.id, connections.createdBy))
      .where(
        and(
          inArray(connections.provider, ['github', 'slack']),
          sql`lower(${users.email}) = any(${textArray(lowered)})`,
        ),
      ),
  );
  const names = new Map<string, { kind: SourceKind; name: string }>();
  const add = (kind: SourceKind, name: string | undefined) => {
    if (name) names.set(`${kind}:${name.toLowerCase()}`, { kind, name });
  };
  for (const row of rows) {
    if (row.provider === 'github') add('github', row.label);
    else {
      add('slack', /^(\S+) \(/.exec(row.label)?.[1]); // un pseudo n'a pas d'espace ; l'espace peut en avoir
      add('slack', row.key?.split(':')[1]);
    }
  }
  return [...names.values()];
}
