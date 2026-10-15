import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem } from '../types';
import { type BoardItem, type MiroClient, miroClient } from './client';
import { byTime, isAfter, markAfter, readMark } from './cursor';
import { boardToItem } from './map';
import { miroOAuth } from './oauth';

// Miro : le texte des tableaux (notes, textes, formes, cartes, cadres, documents).
//
// Doc lue le 15/10/2026 :
//   https://developers.miro.com/docs/getting-started-with-oauth et .../reference/scopes (jeton OAuth,
//     en-tête Authorization: Bearer, droit boards:read ; voir oauth.ts)
//   https://developers.miro.com/reference/get-boards-1 (GET /v2/boards : team_id, sort, limit de 1
//     à 50, offset ; boards:read ; niveau 1 de débit)
//   https://developers.miro.com/reference/get-items-1 (GET /v2/boards/{id}/items : limit de 10 à 50,
//     cursor, type ; réponse data, cursor, total ; pas de filtre par date)
//   https://developers.miro.com/reference/get-access-token-context (GET /v1/oauth-token : user, team)
//   https://developers.miro.com/reference/rate-limiting (429 ; x-ratelimit-reset en secondes depuis 1970)
//   https://developers.miro.com/docs/miro-rest-api-introduction (commentaires : non lisibles par l'API)
//   modèles du SDK (github.com/miroapp/api-clients, packages/miro-api/model) : data de chaque type
//
// Choix. Aucune clé collée : Miro ne se branche que par le bouton. La liste des tableaux n'a pas de
// filtre « modifié depuis » et le sens de `sort=last_modified` n'est pas documenté : on lit tous les
// tableaux de l'équipe (50 par requête, dans l'ordre de création, qui ne bouge pas), on garde ceux
// modifiés depuis le curseur et on les trie ici. Un tableau est un élément : on lit ses éléments (50
// par requête, 1 000 au plus, le reste est ignoré) et on en tire un seul tour `document`. Un tableau
// dont les éléments répondent 403 ou 404 (accès retiré, tableau supprimé entre-temps) est rendu avec
// sa seule description. Les commentaires de Miro, les images et les connecteurs ne sont pas lus.
//
// Non vérifié (aucune appli réelle) : que la modification d'un élément fait avancer `modifiedAt` du
// tableau (sinon une retouche n'est lue qu'à la modification suivante du tableau) ; que la liste sans
// équipe et sans ordre stable ne saute aucun tableau ; le texte exact des notes (HTML, d'après la doc
// du SDK) ; un 400 « jeton invalide » de GET /v1/oauth-token, que la doc décrit à la place d'un 401
// (la vérification échouerait alors en « Miro a répondu 400 », pas en jeton refusé) ; un essai en réel.

// Miro ne se branche que par le bouton : la forme à clé n'existe pas. Les jetons ne sont pas dans
// `secretFields` : le socle les chiffre à part.
const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

// Tableaux lus avant d'enregistrer le curseur : un plantage refait au pire ce lot.
const BOARDS_PER_BATCH = 5;

// Un 403 ou un 404 sur les éléments d'un tableau : on garde le tableau, sans ses éléments.
async function itemsOrNone(miro: MiroClient, boardId: string): Promise<BoardItem[]> {
  try {
    return await miro.items(boardId);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) return [];
    throw error;
  }
}

export const miroConnector: Connector<Config> = {
  id: 'miro',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['api.miro.com'],
  oauth: miroOAuth,

  async verify(config, http) {
    return { account: await miroClient(config.accessToken, http).account() };
  },

  async *sync(config, state, http) {
    const miro = miroClient(config.accessToken, http);
    const previous = readMark(state.cursor, state.since);
    const boards = (await miro.boards(config.teamId ?? null))
      .filter(isAfter(previous))
      .sort(byTime);
    for (let start = 0; start < boards.length; start += BOARDS_PER_BATCH) {
      const end = Math.min(start + BOARDS_PER_BATCH, boards.length);
      const items: ConnectorItem[] = [];
      for (const board of boards.slice(start, end)) {
        const item = boardToItem(board, await itemsOrNone(miro, board.id));
        if (item !== null) items.push(item);
      }
      yield { items, cursor: markAfter(boards.slice(0, end), previous) };
    }
  },
};
