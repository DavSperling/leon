import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type FolkClient, folkClient } from './client';
import { advance, isDone, readCursor } from './cursor';
import { createdAtOf, toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.folk.app/api-reference/overview (https://api.folk.app, HTTPS seulement)
//   https://developer.folk.app/api-reference/authentication (Authorization: Bearer <clé> ; clé créée
//     dans les réglages de l'espace, section API ; 401 sans clé valide)
//   https://developer.folk.app/api-reference/users/get-the-current-user (GET /v1/users/me)
//   https://developer.folk.app/api-reference/notes/list-notes (GET /v1/notes : limit 1 à 100, cursor,
//     createdAfter / createdBefore depuis le 29/06/2026, entity.id ; aucun tri documenté)
//   https://developer.folk.app/api-reference/pagination (le lien pagination.nextLink de la réponse
//     donne la page suivante ; absent à la dernière)
//   https://developer.folk.app/api-reference/rate-limits (600 requêtes par minute et 20 par 2 secondes,
//     par utilisateur ; 429 avec Retry-After en secondes)
//   https://developer.folk.app/api-reference/versioning (en-tête X-API-Version, recommandé)
//   https://developer.folk.app/api-reference/interactions/list-interactions (bêta)
//   https://developer.folk.app/changelog et le schéma OpenAPI https://developer.folk.app/schemas/2025-06-09.json
//
// Écarts au plan, d'après la doc :
// - Seules les notes sont lues. Les interactions (bêta) ne se listent que fiche par fiche
//   (`entity.id` est obligatoire) : il faudrait parcourir tous les contacts et toutes les
//   entreprises, et la liste des entreprises ne se filtre pas par date d'interaction. Ni la
//   bêta ni ce parcours ne sont assez sûrs sans clé réelle : à reprendre une fois la clé essayée.
// - La liste des notes n'a ni tri ni date de modification. On lit toutes les notes créées après le
//   curseur, on les trie ici, et on les rend par pages de 100. Chaque passage relit donc la liste
//   depuis le curseur (une requête par 50 notes) : un très gros premier passage en coûte plusieurs.
//   Une note modifiée après sa création n'est pas relue (comme les activités de Close).
// - Une note privée (`visibility: private`) n'est pas rendue : tout remonte à l'équipe dans Leon,
//   et folk la réserve à son auteur. Il n'y a pas de lien vers une note : `url` est nul.
//
// Non vérifié (aucune clé réelle) : que la valeur `2025-06-09` de X-API-Version est acceptée (la
// doc la donne en exemple ; une valeur invalide donne un 400) ; que `createdAfter` exclut l'instant
// donné (le curseur recule d'une milliseconde et écarte les notes déjà vues : juste dans les deux
// cas) ; que le lien `nextLink` conserve le filtre `createdAfter` (il est suivi tel quel) ; que la
// clé voit les notes des autres membres ; que la limite de 20 requêtes par 2 secondes est tenue au
// rythme choisi (120 ms) ; la forme exacte d'une note sans date, d'un auteur supprimé.

const ConfigSchema = z.object({ apiKey: z.string().trim().min(1).max(500) });
type Config = z.infer<typeof ConfigSchema>;

const PAGE_SIZE = 100;

async function* syncNotes(
  folk: FolkClient,
  since: Date,
  rawCursor: string | null,
): AsyncGenerator<SyncPage> {
  let mark = readCursor(rawCursor);
  const from = mark ? new Date(mark.at - 1) : since;
  const notes = (await folk.notesCreatedAfter(from))
    .flatMap((note) => {
      const createdAt = createdAtOf(note);
      return createdAt ? [{ note, createdAt }] : [];
    })
    .filter(({ note, createdAt }) => !isDone(mark, createdAt.getTime(), note.id))
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.note.id.localeCompare(b.note.id),
    );
  for (let first = 0; first < notes.length; first += PAGE_SIZE) {
    const items: ConnectorItem[] = [];
    for (const { note, createdAt } of notes.slice(first, first + PAGE_SIZE)) {
      const item = toItem(note, createdAt);
      if (item) items.push(item);
      mark = advance(mark, createdAt.getTime(), note.id);
    }
    yield { items, cursor: JSON.stringify(mark) };
  }
}

export const folkConnector: Connector<Config> = {
  id: 'folk',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.folk.app'],
  minIntervalMs: 120, // 20 requêtes par 2 secondes, 600 par minute

  async verify(config: Config, http: ConnectorHttp) {
    const user = await folkClient(config.apiKey, http).me();
    return { account: user.email ? `${user.fullName} (${user.email})` : user.fullName };
  },

  sync(config: Config, state, http: ConnectorHttp) {
    return syncNotes(folkClient(config.apiKey, http), state.since, state.cursor);
  },
};
