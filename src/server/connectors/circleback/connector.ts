import { z } from 'zod';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { checkKey, fetchTranscript, HOST, type Meeting, meetingPages } from './client';
import { meetingToItem } from './map';

// Doc lue le 15/10/2026 :
//   https://circleback.ai/docs/api (clé cb_…, Bearer, base https://circleback.ai/api, limites,
//     pagination par l'en-tête Link, erreurs)
//   https://circleback.ai/docs/api/meetings/list-meetings (GET /meetings)
//   https://circleback.ai/docs/api/meetings/get-meeting-transcript (GET /meeting/{id}/transcript)
//   https://circleback.ai/docs/api/people/list-people (GET /people)
// Écarts avec le plan : le filtre « modifié depuis » n'existe pas (ni sur /meetings ni sur /search)
// et l'ordre de la liste n'est pas documenté ; l'API ne donne ni point d'accès « moi » ni heure de
// début de réunion.
// Choix : on lit toute la liste à chaque passage, on garde ce qui a changé après le curseur (ou
// « since »), on trie par modification croissante, puis on lit la transcription de chacune.
// Le curseur est la date de dernière modification de la dernière réunion rendue. Seules les
// réunions de l'utilisateur sont lues (ownership=Mine) ; ses notes privées ne le sont jamais. Un
// 403 ou 404 sur une transcription laisse la réunion sans transcription.
// Non vérifié : ordre de la liste, taille d'une page, effet d'une réunion encore en traitement
// (on suppose que sa date de modification change à la fin du traitement), que la date de création
// est bien le début de la réunion, le code rendu pour une clé refusée (on suppose 401), et la
// limite de 20 requêtes par minute du plan gratuit (reprises sur 429 par le client commun).

const PAGE_SIZE = 50;

const ConfigSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^cb_\S+$/, 'La clé Circleback commence par cb_'),
});
type Config = z.infer<typeof ConfigSchema>;

// Le curseur plus récent que « since » (un curseur illisible ne compte pas).
function modifiedAfter(state: SyncState): number {
  const cursor = state.cursor === null ? Number.NaN : Date.parse(state.cursor);
  return Math.max(state.since.getTime(), Number.isNaN(cursor) ? Number.NEGATIVE_INFINITY : cursor);
}

const modifiedAt = (meeting: Meeting) => Date.parse(meeting.updatedAt);

// Deux réunions modifiées au même instant restent dans la même page : le curseur est une date et
// la reprise commence strictement après.
function pagesOf(sorted: Meeting[]): Meeting[][] {
  const pages: Meeting[][] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = Math.min(start + PAGE_SIZE, sorted.length);
    while (
      end < sorted.length &&
      modifiedAt(sorted[end] as Meeting) === modifiedAt(sorted[end - 1] as Meeting)
    ) {
      end++;
    }
    pages.push(sorted.slice(start, end));
    start = end;
  }
  return pages;
}

export const circlebackConnector: Connector<Config> = {
  id: 'circleback',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: () => [HOST],
  minIntervalMs: 350, // plan gratuit : 3 requêtes par seconde
  async verify(config, http) {
    await checkKey(http, config.apiKey);
    return { account: 'compte Circleback' }; // l'API ne dit pas à qui est la clé
  },
  async *sync(config, state, http): AsyncGenerator<SyncPage> {
    const after = modifiedAfter(state);
    const recent: Meeting[] = [];
    for await (const meetings of meetingPages(http, config.apiKey)) {
      recent.push(...meetings.filter((meeting) => modifiedAt(meeting) > after));
    }
    recent.sort((a, b) => modifiedAt(a) - modifiedAt(b));
    for (const page of pagesOf(recent)) {
      const items: ConnectorItem[] = [];
      for (const meeting of page) {
        const item = meetingToItem(meeting, await fetchTranscript(http, config.apiKey, meeting.id));
        if (item) items.push(item);
      }
      yield { items, cursor: (page.at(-1) as Meeting).updatedAt };
    }
  },
};
