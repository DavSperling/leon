import { fold } from '@/lib/text';

export type Person = { id: string; name: string; firstName: string; email: string; external?: boolean };

export const ORG = { name: 'Acme', initial: 'A', version: 'v0.2' } as const;

const person = (id: string, name: string, email: string, external = false): Person => ({
  id, name, firstName: name.split(' ')[0] ?? name, email, external,
});

export const ME = person('david', 'David Sperling', 'david@acme.fr');
export const JULIE = person('julie', 'Julie Martin', 'julie@acme.fr');
export const BOB = person('bob', 'Bob Durand', 'bob@acme.fr');
export const ALICE = person('alice', 'Alice Bernard', 'alice@acme.fr');
export const THOMAS = person('thomas', 'Thomas Roux', 'thomas@acme.fr');
/** Parti de l'équipe : sa connexion Jira s'est arrêtée. */
export const PIERRE = person('pierre', 'Pierre Garnier', 'pierre@acme.fr');
/** Le client : Marc Lefèvre, chez ACME. */
export const MARC = person('marc', 'Marc Lefèvre (ACME)', 'marc.lefevre@acme-industries.com', true);

export const TEAM: Person[] = [ME, JULIE, BOB, ALICE, THOMAS];
export const PEOPLE: Person[] = [...TEAM, MARC];

/** Les membres dont le nom ou l'e-mail commence comme `query` (sans casse ni accent) : « julie », « bob@ ». */
export function findPeople(query: string): Person[] {
  const q = fold(query.trim());
  if (!q) return [];
  return TEAM.filter((p) => fold(p.name).split(' ').some((w) => w.startsWith(q)) || fold(p.name).startsWith(q) || fold(p.email).startsWith(q));
}
