import { z } from 'zod';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { createTldvClient, type Meeting, type TldvClient } from './client';
import { toItem } from './map';

// tl;dv : les réunions où la personne de la clé était présente, avec leur transcription.
//
// Doc lue le 15/10/2026 : https://doc.tldv.io (API v1alpha1, adresse de base
// https://pasta.tldv.io/v1alpha1, clé dans l'en-tête x-api-key ; GET /meetings avec page, limit
// (100 au plus), from, onlyParticipated ; GET /meetings/{id}/transcript ; GET /meetings/{id}/notes)
// et https://intercom.help/tldv/en/articles/11583137-api (API réservée aux offres Pro et
// Business, selon l'offre de l'organisateur de la réunion). Les conditions
// https://tldv.io/terms interdisent de copier ou stocker une partie importante du contenu (voir
// `warning` du catalogue).
//
// Écart avec le plan : l'hôte de l'API est pasta.tldv.io, pas doc.tldv.io (le site de la doc).
// Choix :
// - onlyParticipated : seules les réunions où la personne de la clé était présente sont lues, car
//   tout ce que lit Leon devient visible de l'équipe ;
// - la liste est lue en entier depuis le jour de départ puis triée ici (la doc ne dit rien de son
//   ordre) ; le curseur est l'instant et l'identifiant de la dernière réunion rendue ;
// - une réunion sans transcription depuis moins de 6 heures est attendue (le passage s'arrête
//   devant elle, on y revient au passage suivant), ensuite on prend le résumé de l'outil ;
// - un 403 sur la transcription ou le résumé (offre de l'organisateur) donne une réunion sans ces
//   tours ; une réunion sans aucun texte n'est pas rendue, mais le curseur la dépasse.
//
// Non vérifié : l'ordre de la liste ; le format du paramètre `from` (on envoie un jour
// AAAA-MM-JJ, avec un jour de marge, et la précision se fait ici) ; l'unité de startTime
// (supposée en secondes) ; le code rendu quand la transcription n'est pas prête (400 ou 404
// supposés) ; les limites de débit (non documentées).

const ConfigSchema = z.object({ apiKey: z.string().trim().min(1) });
type Config = z.infer<typeof ConfigSchema>;

// Un curseur enregistré toutes les 20 réunions (une ou deux requêtes chacune).
const MEETINGS_PER_PAGE = 20;
const TRANSCRIPT_WAIT_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

type Cursor = { at: number; id: string }; // début et identifiant de la dernière réunion rendue
const CursorSchema = z.object({ at: z.number(), id: z.string() });
type Queued = Cursor & { meeting: Meeting };

function parseCursor(text: string | null): Cursor | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // curseur illisible : on repart de `since`, l'envoi est idempotent
  }
}

function compare(a: Cursor, b: Cursor): number {
  if (a.at !== b.at) return a.at - b.at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Les réunions à lire, de la plus ancienne à la plus récente, après le curseur.
async function queueMeetings(client: TldvClient, state: SyncState): Promise<Queued[]> {
  const after = parseCursor(state.cursor);
  const sinceMs = state.since.getTime();
  // Un jour de marge : la doc ne dit pas dans quel fuseau `from` est lu, le filtre exact est ici.
  const from = new Date(Math.max(sinceMs, after?.at ?? 0) - DAY_MS).toISOString().slice(0, 10);
  return (await client.listMeetings(from))
    .map((meeting) => ({ meeting, at: Date.parse(meeting.happenedAt), id: meeting.id }))
    .filter((queued) => queued.at >= sinceMs && (after === null || compare(queued, after) > 0))
    .sort(compare);
}

// Le texte d'une réunion : sa transcription, à défaut son résumé. null : une réunion récente n'a pas
// encore de transcription, on l'attend.
async function readContent(client: TldvClient, { meeting, at }: Queued) {
  const { value: segments, absent } = await client.transcript(meeting.id);
  if (segments.length > 0) return { segments, notes: '' };
  if (absent !== 'forbidden' && Date.now() - at < TRANSCRIPT_WAIT_MS) return null;
  return { segments, notes: await client.notes(meeting.id) };
}

export const tldvConnector: Connector<Config> = {
  id: 'tldv',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: () => ['pasta.tldv.io'],

  async verify(config, http) {
    const total = await createTldvClient(config.apiKey, http).countMeetings();
    const plural = total > 1 ? 's' : '';
    return { account: `${total} réunion${plural} accessible${plural}` };
  },

  async *sync(config, state, http): AsyncGenerator<SyncPage> {
    const client = createTldvClient(config.apiKey, http);
    let items: ConnectorItem[] = [];
    let last: Cursor | null = null;
    let count = 0;
    for (const queued of await queueMeetings(client, state)) {
      const content = await readContent(client, queued);
      if (content === null) break;
      const item = toItem(queued.meeting, content);
      if (item) items.push(item);
      last = { at: queued.at, id: queued.id };
      if (++count % MEETINGS_PER_PAGE === 0) {
        yield { items, cursor: JSON.stringify(last) };
        items = [];
        last = null;
      }
    }
    if (last) yield { items, cursor: JSON.stringify(last) };
  },
};
