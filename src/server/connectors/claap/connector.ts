import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, ConnectorItem } from '../types';
import { fetchSegments, fetchWorkspaceName, listRecordings, type Recording } from './client';
import { listStart, readCursor, writeCursor } from './cursor';
import { toItem } from './map';

// Claap : les enregistrements de l'espace (réunions et captures) avec leur transcription.
//
// Doc lue le 15/10/2026 : https://docs.claap.io/api-reference/overview, /authentication
// (en-tête X-Claap-Key, clé « cla_… »), /endpoint/list_recordings (GET /v1/recordings : sort,
// limit 100 au plus, cursor, createdAfter, pas de filtre « modifié depuis »),
// /endpoint/get_recording_transcript (GET /v1/recordings/{id}/transcript), /endpoint/get_workspace
// (GET /v1/workspaces/mine), /recordings (visibilité), /rate_limiting, /errors,
// https://help.claap.io/en/articles/11833785-using-claap-s-api (clé créée par un administrateur).
//
// Écarts avec le plan (la doc gagne) :
// - la transcription arrive déjà en phrases (`segments`, locuteur, début) : il n'y a pas de mots à
//   regrouper ; `words` est ignoré ;
// - 3 requêtes par seconde et par route (`minIntervalMs` 400), 3 000 par jour pour tout l'espace,
//   quelle que soit la clé : au plus 100 transcriptions lues par passage ;
// - la liste n'a pas de résumé ni de points clés : un enregistrement sans transcription n'est pas
//   rendu (il faudrait une requête de plus par enregistrement pour son détail) ;
// - une clé ordinaire ne voit pas les enregistrements privés ; seule une clé « Full access »
//   (réservée aux propriétaires de l'espace) les voit, d'où l'avertissement du catalogue.
//
// Choix : la liste est triée par création (`created_asc`) et relue six heures avant le dernier
// enregistrement dépassé (voir cursor.ts). Un enregistrement dont le tableau `transcripts` est
// vide n'a pas encore de transcription : on ne la demande pas et on le revoit au passage suivant.
// Un 404 ou un 403 sur une transcription la laisse de côté (l'enregistrement n'est pas rendu).
//
// Fixtures : les transcriptions reprennent l'exemple de la doc (`speaker_1`, `startedAt`) ; la
// liste et l'espace sont construits d'après les schémas, la doc n'en donne pas d'exemple.
//
// Non vérifié (aucune clé, aucun appel réel) : le format des dates (ISO 8601 avec fuseau
// supposé) et de `createdAfter` (on envoie de l'ISO, borne inclusive ou non) ; l'unité de
// `startedAt` (secondes, d'après l'exemple « 136.1 » ↔ « 02:17 ») ; qu'il parte du début de
// l'enregistrement et non de l'heure prévue de la réunion ; qu'une transcription prête remplisse
// `transcripts` dans la liste ; le plan Claap qui donne accès à l'API ; l'en-tête Retry-After sur
// un 429 (non documenté : attente de 2, 4 puis 8 s).

const configSchema = z.object({ apiKey: z.string().trim().min(1) });
type Config = z.infer<typeof configSchema>;

const PAGE_SIZE = 50;
const READS_MAX = 100; // transcriptions lues par passage (quota de 3 000 requêtes par jour)

type Walk = { after: string | null; seen: Map<string, string>; reads: number };

// Lit les transcriptions d'une page de la liste, dans l'ordre, jusqu'à la limite du passage.
async function readPage(
  http: ConnectorHttp,
  apiKey: string,
  recordings: Recording[],
  walk: Walk,
): Promise<ConnectorItem[]> {
  const items: ConnectorItem[] = [];
  for (const recording of recordings) {
    if (walk.reads >= READS_MAX) break;
    const created = new Date(recording.createdAt).toISOString();
    if (walk.after === null || created > walk.after) walk.after = created;
    if (walk.seen.has(recording.id) || !recording.transcripts?.length) continue;
    walk.reads += 1;
    const segments = await fetchSegments(http, apiKey, recording.id);
    walk.seen.set(recording.id, created);
    const item = segments && toItem(recording, segments);
    if (item) items.push(item);
  }
  return items;
}

export const claapConnector: Connector<Config> = {
  id: 'claap',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.claap.io'],
  minIntervalMs: 400,

  async verify(config, http) {
    return { account: `Claap (espace ${await fetchWorkspaceName(http, config.apiKey)})` };
  },

  async *sync(config, state, http) {
    const cursor = readCursor(state.cursor);
    const createdAfter = listStart(cursor, state.since).toISOString();
    const walk: Walk = {
      after: cursor?.after ?? null,
      seen: new Map(Object.entries(cursor?.seen ?? {})),
      reads: 0,
    };
    let next: string | null = null;
    do {
      const page = await listRecordings(http, config.apiKey, {
        createdAfter,
        limit: PAGE_SIZE,
        cursor: next ?? undefined,
      });
      const items = await readPage(http, config.apiKey, page.recordings, walk);
      if (walk.after !== null && page.recordings.length > 0) {
        yield { items, cursor: writeCursor(walk.after, walk.seen) };
      }
      next = walk.reads >= READS_MAX ? null : page.next;
    } while (next !== null);
  },
};
