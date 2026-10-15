import type { ConnectorHttp } from '../http';
import {
  ActivitiesPageSchema,
  MeSchema,
  NotesPageSchema,
  type Person,
  UsersSchema,
} from './schemas';
import type { Position } from './stream';

// Les requêtes vers l'API de Pipedrive : notes en v1, activités en v2 (elles n'existent plus en v1).
// La clé passe par l'en-tête x-api-token, sur l'adresse de l'entreprise.

export type PipedriveAccess = { company: string; token: string };

const PAGE_SIZE = 100; // le maximum documenté est 500 ; des notes et des descriptions entières : des pages modestes

export function pipedriveClient(access: PipedriveAccess, http: ConnectorHttp) {
  const base = `https://${access.company}.pipedrive.com/api`;
  const headers = { 'x-api-token': access.token };

  return {
    me: () => http.json({ url: `${base}/v1/users/me`, headers }, MeSchema),

    // Tous les utilisateurs de l'entreprise, par identifiant (les activités ne portent pas de nom).
    async users(): Promise<Map<number, Person>> {
      const { data } = await http.json({ url: `${base}/v1/users`, headers }, UsersSchema);
      const people = new Map<number, Person>();
      for (const user of data ?? []) {
        people.set(user.id, { name: user.name || null, email: user.email || null });
      }
      return people;
    },

    // Les notes modifiées depuis `updatedSince` (inclus), de la plus ancienne à la plus récente ;
    // la page suivante se désigne par son rang (`start`).
    async notes(updatedSince: string, start: Position) {
      const request = {
        url: `${base}/v1/notes`,
        headers,
        query: {
          updated_since: updatedSince,
          sort: 'update_time ASC,id ASC',
          limit: PAGE_SIZE,
          start,
        },
      };
      const page = await http.json(request, NotesPageSchema);
      const more = page.additional_data?.pagination;
      return {
        rows: page.data ?? [],
        next: more?.more_items_in_collection ? (more.next_start ?? null) : null,
      };
    },

    // Les activités modifiées depuis `updatedSince` (inclus), de la plus ancienne à la plus récente ;
    // la page suivante se désigne par un curseur opaque.
    async activities(updatedSince: string, cursor: Position) {
      const request = {
        url: `${base}/v2/activities`,
        headers,
        query: {
          updated_since: updatedSince,
          sort_by: 'update_time',
          sort_direction: 'asc',
          limit: PAGE_SIZE,
          cursor,
        },
      };
      const page = await http.json(request, ActivitiesPageSchema);
      return { rows: page.data ?? [], next: page.additional_data?.next_cursor || null };
    },
  };
}

export type PipedriveClient = ReturnType<typeof pipedriveClient>;
