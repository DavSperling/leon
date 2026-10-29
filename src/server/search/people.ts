import { eq } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { members, users } from '@/server/db/schema/auth';

// Qui est qui (D12 du plan du deuxième jet). Cette première version rapproche par l'adresse e-mail et par le
// nom des membres de l'organisation ; T19 y ajoute les comptes des connexions personnelles et les identifiants
// que chacun déclare (GitHub, Linear…), c'est-à-dire `authorNames`.

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
  return { authorEmails: [...emails], authorNames: [], unknown };
}

// Les adresses et les noms d'outil du lecteur : de quoi savoir ce qu'il a écrit.
export async function myAddresses(
  ctx: TenantContext,
): Promise<{ emails: string[]; names: { kind: SourceKind; name: string }[] }> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId));
  return { emails: row ? [row.email.toLowerCase()] : [], names: [] };
}
