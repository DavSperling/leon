import { z } from 'zod';
import type { Connector, ConnectorItem } from '../types';
import { fetchAccount, fetchTranscript, listTranscripts } from './client';
import { isReady, toItem } from './map';

// Fireflies : les réunions transcrites, lues par l'API GraphQL (POST /graphql, clé en Bearer).
//
// Doc lue le 15/10/2026 : https://docs.fireflies.ai/fundamentals/authorization,
// /graphql-api/query/transcripts, /graphql-api/query/transcript, /graphql-api/query/user,
// /schema/transcript, /schema/sentence, /schema/summary, /schema/meeting-info,
// /schema/meeting-attendee, /fundamentals/errors, /miscellaneous/error-codes, /fundamentals/limits.
//
// Choix qui s'écartent du plan (la doc gagne) :
// - la doc ne donne pas l'ordre de `transcripts` : on liste d'abord les identifiants et dates
//   (une requête par 50), on trie nous-mêmes, puis on lit chaque fiche avec `transcript(id)`.
// - `fromDate` filtre sur la création, et Fireflies ne donne aucune date de modification : une
//   réunion n'est lue qu'une fois. Les réunions finissent dans l'ordre de leur fin, pas de leur
//   début : on relit donc la liste 24 h avant le dernier début rendu, et le curseur retient les
//   identifiants déjà rendus pour ne pas relire leurs fiches.
// - limites de la doc : gratuit 30 requêtes par minute et 500 par jour, Pro 60 et 5 000 (le plan
//   disait 50 par jour) ; `minIntervalMs` 1000 tient sous 60 par minute.
// - une réunion dont le résumé est « processing » n'est pas rendue : elle est relue au passage suivant.
// - 403 ou 404 sur la fiche d'une réunion : elle est passée, les autres sont rendues. Seul un 401
//   (ou un refus sur la liste) remonte.
//
// Non vérifié (aucune clé, aucun appel réel) : l'unité de `start_time` (typé String par la doc :
// secondes supposées, une valeur illisible place la phrase au début de la réunion) ; le code
// d'erreur HTTP d'une clé refusée (`auth_failed` : seul un site tiers dit 401, d'où la conversion
// aussi des erreurs rendues avec un code 200) ; la forme de `fromDate` (la doc écrit
// « YYYY-MM-DDTHH:mm.sssZ », on envoie l'ISO complet) et son caractère inclusif ou non (on filtre
// aussi de notre côté).

const configSchema = z.object({ apiKey: z.string().trim().min(1) });
type Config = z.infer<typeof configSchema>;

const PAGE_SIZE = 10; // fiches par page rendue
const OVERLAP_MS = 24 * 3_600_000;

// after : début de la réunion la plus récente rendue ; seen : les réunions déjà vues dans les
// 24 h qui précèdent.
const cursorSchema = z.object({ after: z.iso.datetime(), seen: z.array(z.string()) });

// Un curseur illisible fait repartir de `since` : relire ne crée aucun doublon.
function readCursor(raw: string | null) {
  if (raw === null) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const firefliesConnector: Connector<Config> = {
  id: 'fireflies',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.fireflies.ai'],
  minIntervalMs: 1000,

  async verify(config, http) {
    return { account: await fetchAccount(http, config.apiKey) };
  },

  async *sync(config, state, http) {
    const cursor = readCursor(state.cursor);
    let after = cursor ? Date.parse(cursor.after) : Number.NEGATIVE_INFINITY;
    const from = cursor
      ? Math.max(state.since.getTime(), after - OVERLAP_MS)
      : state.since.getTime();
    const listed = await listTranscripts(http, config.apiKey, new Date(from));
    const seen = new Set(cursor?.seen);
    const todo = [...listed]
      .filter(([id]) => !seen.has(id))
      .sort(([idA, dateA], [idB, dateB]) => dateA - dateB || idA.localeCompare(idB));

    for (let start = 0; start < todo.length; start += PAGE_SIZE) {
      const items: ConnectorItem[] = [];
      for (const [id, date] of todo.slice(start, start + PAGE_SIZE)) {
        const transcript = await fetchTranscript(http, config.apiKey, id);
        if (transcript !== null && !isReady(transcript)) continue; // relue au passage suivant
        seen.add(id);
        after = Math.max(after, date);
        if (transcript !== null) items.push(toItem(id, date, transcript));
      }
      if (items.length === 0) continue;
      const kept = [...seen].filter(
        (id) => (listed.get(id) ?? Number.NEGATIVE_INFINITY) >= after - OVERLAP_MS,
      );
      yield { items, cursor: JSON.stringify({ after: new Date(after).toISOString(), seen: kept }) };
    }
  },
};
