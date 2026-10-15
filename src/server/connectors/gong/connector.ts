import { z } from 'zod';
import type { Connector } from '../types';
import { gongClient } from './client';
import { advance, startWalk } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://help.gong.io/apidocs (authentification Basic, adresse de base, limites, pagination)
//   https://help.gong.io/apidocs/retrieve-detailed-call-data-by-various-filters-v2callsextensive-2.md
//     (POST /v2/calls/extensive : appels, participants avec speakerId, résumé)
//   https://help.gong.io/apidocs/retrieve-call-data-by-date-range-v2calls-2.md (GET /v2/calls)
//   https://help.gong.io/apidocs/retrieve-transcripts-of-calls-by-date-or-callids-v2callstranscript-2.md
//   https://help.gong.io/docs/receive-access-to-the-api.md (clé créée par un administrateur technique)
//   https://help.gong.io/docs/create-an-app-for-gong.md (adresse de base propre à chaque client)
//
// Ce que la doc change au plan :
//   - GET /v2/calls exige fromDateTime ET toDateTime et ne rend pas les participants : on liste avec
//     POST /v2/calls/extensive (période, participants avec speakerId, résumé) ;
//   - les dates et les identifiants de /v2/calls/transcript vont dans un objet « filter », le curseur
//     à côté ; on ne donne que callIds ;
//   - la doc ne dit pas que « api.gong.io » seul est valable : l'adresse de base est propre à chaque
//     client (« company-17.api.gong.io » dans l'exemple), d'où le sous-domaine obligatoire.
//
// Choix à cause de la doc :
//   - pas de filtre « modifié depuis » : une période seulement, sur l'heure prévue pour une
//     visioconférence et sur l'heure de début sinon. L'ordre de la liste n'est pas documenté et
//     le délai de traitement non plus : chaque parcours relit les six dernières heures (cursor.ts) ;
//   - 404 = aucun appel (ou aucune transcription) pour la demande : lu comme une réponse vide ;
//   - 3 appels par seconde et 10 000 par jour : 350 ms entre deux requêtes ; un passage de 200 appels
//     coûte une dizaine de requêtes, et la relecture des six dernières heures toutes les 15 minutes
//     reste très en dessous de la limite du jour ;
//   - transcriptions demandées par lots de 50 identifiants (le maximum n'est pas documenté) ;
//   - aucun point d'accès ne dit à qui est la clé : verify lit une heure d'appels et rend le
//     sous-domaine ;
//   - la transcription est le contenu principal, pas une ressource secondaire : un 401 ou 403 sur
//     elle remonte (clé sans le droit de lire les transcriptions) ;
//   - sans transcription, le résumé de Gong devient un tour document ; ni l'un ni l'autre : l'appel
//     n'est pas rendu, mais la relecture des six dernières heures le reprend quand son texte arrive.
//
// Non vérifié (aucun appel réel) : l'ordre de la liste ; le délai entre la fin d'un appel et son
// apparition dans la liste (six heures par prudence) ; que Gong liste un appel avant la fin de son
// traitement ; qu'un curseur de page reste valable d'une relève à l'autre ; le nombre d'appels par
// page (100 dans les exemples) et le maximum d'identifiants par requête de transcription ; que les
// portées de la clé (api:calls:read:extensive, api:calls:read:transcript) suffisent ; que « start »
// d'une phrase part de l'heure de début de l'appel ; la forme du corps d'un 403.

const configSchema = z.object({
  baseUrlHost: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  accessKey: z.string().trim().min(1),
  accessKeySecret: z.string().trim().min(1),
});
type Config = z.infer<typeof configSchema>;

const HOUR_MS = 3600 * 1000;

export const gongConnector: Connector<Config> = {
  id: 'gong',
  configSchema,
  // Le secret d'abord : l'empreinte affichée en est tirée. La clé d'accès change avec lui quand on remplace la clé.
  secretFields: ['accessKeySecret', 'accessKey'],
  hosts: (config) => [`${config.baseUrlHost}.api.gong.io`],
  minIntervalMs: 350,

  async verify(config, http) {
    const now = Date.now();
    await gongClient(config, http).listCalls({
      from: new Date(now - HOUR_MS).toISOString(),
      to: new Date(now).toISOString(),
      details: false,
    });
    return { account: `Gong (${config.baseUrlHost})` };
  },

  async *sync(config, state, http) {
    const gong = gongClient(config, http);
    let walk = startWalk(state.cursor, state.since);
    do {
      const { calls, next } = await gong.listCalls({
        from: walk.after,
        to: walk.to,
        cursor: walk.next,
        details: true,
      });
      const speech = await gong.transcripts(calls.map((call) => call.metaData.id));
      const started = calls.map((call) => new Date(call.metaData.started).toISOString());
      walk = advance(walk, started, next, state.since);
      const items = calls.flatMap((call) => {
        const item = toItem(call, speech.get(call.metaData.id) ?? []);
        return item === null ? [] : [item];
      });
      yield { items, cursor: JSON.stringify(walk) };
    } while (walk.next !== null);
  },
};
