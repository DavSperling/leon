import type { ConnectorTurn } from '../types';
import { type Api, fetchSpaces, fetchUsers } from './client';
import { ignoring } from './ignoring';

// Qui est qui, et quel espace est quel espace : l'API ne donne que des numéros. Demandé une fois par
// identifiant pour tout le passage, par lots.

export type Author = ConnectorTurn['author'];
export const NOBODY: Author = { name: null, email: null };

const USERS_PER_REQUEST = 250; // le maximum de l'API

export type Directory = {
  learn(accountIds: Iterable<string>, spaceIds: Iterable<string>): Promise<void>;
  author(accountId: string | null | undefined): Author;
  space(spaceId: string | null | undefined): string | undefined; // la clé, ou le numéro si inconnue
};

export function createDirectory(api: Api): Directory {
  const people = new Map<string, Author>();
  const spaces = new Map<string, string>();

  // Un droit manquant (403) ou un identifiant inconnu laisse le repli, sans redemander.
  async function learnPeople(accountIds: string[]) {
    const unknown = accountIds.filter((id) => !people.has(id)).sort();
    for (let start = 0; start < unknown.length; start += USERS_PER_REQUEST) {
      const batch = unknown.slice(start, start + USERS_PER_REQUEST);
      const found = await ignoring(fetchUsers(api, batch), [403, 404], []);
      for (const id of batch) people.set(id, NOBODY);
      for (const user of found) {
        const email = user.email?.trim();
        people.set(user.accountId, {
          name: user.displayName?.trim() || user.publicName?.trim() || null,
          email: email ? email : null, // masqué par le profil : chaîne vide
        });
      }
    }
  }

  async function learnSpaces(spaceIds: string[]) {
    const unknown = spaceIds.filter((id) => !spaces.has(id)).sort();
    if (unknown.length === 0) return;
    const found = await ignoring(fetchSpaces(api, unknown), [403, 404], []);
    for (const id of unknown) spaces.set(id, id);
    for (const space of found) spaces.set(space.id, space.key);
  }

  return {
    async learn(accountIds, spaceIds) {
      await learnPeople([...new Set(accountIds)]);
      await learnSpaces([...new Set(spaceIds)]);
    },
    author: (accountId) => (accountId ? (people.get(accountId) ?? NOBODY) : NOBODY),
    space: (spaceId) => (spaceId ? spaces.get(spaceId) : undefined),
  };
}
