import { z } from 'zod';
import type { Connector, SyncPage, SyncState } from '../types';
import { callPages, countCalls, HOST } from './client';
import { callToItem } from './map';

// Doc lue le 15/10/2026 :
//   https://docs.public-api.leexi.ai/reference/public-api (base https://public-api.leexi.ai/v1,
//     HTTP Basic « ID de clé:secret » en base 64, pagination page/items, 50 requêtes par minute,
//     codes d'erreur)
//   https://docs.public-api.leexi.ai/reference/list-calls (GET /calls : from, date_filter, order,
//     items, page, with_simple_transcript)
//   https://docs.public-api.leexi.ai/reference/get-call et https://public-api.leexi.ai/v1/openapi.json
//   https://docs.leexi.ai/raw/fr/references/developer/public-api.md (plan AI Meeting minimum, 403
//     si le plan n'inclut pas l'API), .../api-scopes.md et .../guides/general-settings/api-keys.md
// Écarts avec le plan : l'hôte est public-api.leexi.ai (docs.leexi.ai n'est que l'aide en ligne, la
// référence de l'API est sur docs.public-api.leexi.ai). Les appels sont lus par GET /calls avec
// with_simple_transcript=true (le texte de chaque prise de parole, une seule requête par page de
// 25), pas par GET /calls/{uuid}, dont la transcription est mot par mot et demanderait une requête
// par appel pour 50 par minute. Pas de ressource secondaire à lire, donc aucun 403 à attraper.
// Choix : filtre « modifié depuis » = from avec date_filter=updated_at, ordre updated_at asc, page
// par page ; le curseur est la date de dernière modification du dernier appel rendu. Les prises de
// parole sont lues dans simple_transcript (« Nom (00:00 - 00:10) » puis le texte) ; le résumé de
// l'outil ne sert que sans transcription. Un 402 (abonnement inactif) n'est pas une clé refusée.
// Non vérifié : que from porte bien sur updated_at avec date_filter=updated_at (la doc dit
// « created_at » à la fois pour from/to et par défaut de date_filter) et si from est inclusif ;
// qu'updated_at change quand la transcription ou le résumé arrive après la création (un appel
// encore sans texte est sauté, il ne revient que s'il est modifié) ; l'écriture exacte des heures
// de simple_transcript au-delà d'une heure (« 75:30 » ou « 01:15:30 », les deux sont lues) ; le
// nom donné aux locuteurs inconnus ; la taille d'une page de 25 transcriptions longues
// (limite de 10 Mo) ; qu'une page ne saute pas un appel modifié pendant la lecture ; le lien
// leexi_url (la doc montre « ... »).

const ConfigSchema = z.object({
  keyId: z
    .string()
    .trim()
    .regex(/^[^\s:]+$/, 'L’identifiant de la clé ne contient ni espace ni « : »'),
  keySecret: z.string().trim().regex(/^\S+$/, 'Le secret de la clé ne contient pas d’espace'),
});
type Config = z.infer<typeof ConfigSchema>;

// Le curseur plus récent que « since » (un curseur illisible ne compte pas).
function modifiedAfter(state: SyncState): number {
  const cursor = state.cursor === null ? Number.NaN : Date.parse(state.cursor);
  return Math.max(state.since.getTime(), Number.isNaN(cursor) ? Number.NEGATIVE_INFINITY : cursor);
}

export const leexiConnector: Connector<Config> = {
  id: 'leexi',
  configSchema: ConfigSchema,
  secretFields: ['keySecret'],
  hosts: () => [HOST],
  minIntervalMs: 1200, // 50 requêtes par minute et par clé
  async verify(config, http) {
    const count = await countCalls(http, config);
    return { account: `compte Leexi (appels et réunions visibles par la clé : ${count})` };
  },
  async *sync(config, state, http): AsyncGenerator<SyncPage> {
    const after = modifiedAfter(state);
    for await (const calls of callPages(http, config, new Date(after))) {
      // Le serveur peut rendre l'appel du curseur lui-même (from inclusif) : il est déjà ingéré.
      const fresh = calls.filter((call) => Date.parse(call.updated_at) > after);
      if (fresh.length === 0) continue;
      const newest = Math.max(...fresh.map((call) => Date.parse(call.updated_at)));
      yield {
        items: fresh.flatMap((call) => callToItem(call) ?? []),
        cursor: new Date(newest).toISOString(),
      };
    }
  },
};
