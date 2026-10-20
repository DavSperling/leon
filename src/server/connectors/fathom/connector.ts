import { z } from 'zod';
import type { Connector } from '../types';
import { listMeetings } from './client';
import { advance, startWalk } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developers.fathom.ai/quickstart.md (adresse de base, en-tête X-Api-Key, pagination)
//   https://developers.fathom.ai/api-reference/openapi.yaml (GET /meetings, schémas Meeting)
//   https://developers.fathom.ai/api-overview.md (limites : 60 appels par minute, 30 pour les
//   requêtes avec transcription ou résumé, 429 avec Retry-After)
//   https://developers.fathom.ai/faq.md (clé : User Settings › API Access, toutes les offres)
//
// Pas d'intervalle minimal entre requêtes : une relève s'arrête à 200 éléments, donc à une vingtaine
// de pages de 10 réunions, sous la limite de 30 ; un 429 est repris par le client HTTP (Retry-After).
// La clé ne voit que les réunions enregistrées par son propriétaire ou partagées avec lui.
//
// Choix à cause de la doc :
//   - pas de filtre « modifié depuis » : created_after seulement. Une réunion partagée après coup,
//     créée avant le curseur, n'est pas vue ;
//   - l'ordre de la liste n'est pas documenté : voir cursor.ts ;
//   - aucun point d'accès ne dit qui est le propriétaire de la clé : verify ne rend pas de nom ;
//   - transcription absente : le résumé de Fathom devient un tour document ; ni l'un ni l'autre :
//     la réunion n'est pas rendue.
//
// Non vérifié (aucun appel réel) : l'ordre de la liste ; created_after inclusif ou exclusif ; qu'un
// curseur de page reste valable d'une relève à l'autre ; que Fathom liste une réunion avant la fin
// de son traitement ; que les horodatages de la transcription partent du début de l'enregistrement.

const configSchema = z.object({ apiKey: z.string().trim().min(1) });
type Config = z.infer<typeof configSchema>;

export const fathomConnector: Connector<Config> = {
  id: 'fathom',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.fathom.ai'],

  async verify(config, http) {
    const page = await listMeetings(http, config.apiKey, {});
    const seen = page.items.length > 0 ? '' : ', mais aucune réunion visible pour le moment';
    return { account: `Fathom (clé valide${seen})` };
  },

  async *sync(config, state, http) {
    let walk = startWalk(state.cursor, state.since);
    do {
      const page = await listMeetings(http, config.apiKey, {
        created_after: walk.after,
        cursor: walk.next ?? undefined,
        include_transcript: true,
        include_summary: true,
      });
      const converted = page.items.map((meeting) => ({
        created: new Date(meeting.created_at).toISOString(),
        item: toItem(meeting),
      }));
      const ready = converted.map(({ created, item }) => ({ created, ready: item !== null }));
      walk = advance(walk, ready, page.next_cursor || null);
      const items = converted.flatMap(({ item }) => (item === null ? [] : [item]));
      yield { items, cursor: JSON.stringify(walk) };
    } while (walk.next !== null);
  },
};
