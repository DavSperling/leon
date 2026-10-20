import { z } from 'zod';
import type { Connector } from '../types';
import { productboardClient } from './client';
import { productboardOAuth } from './oauth';
import { syncNotes } from './sync';

// Doc lue le 15/10/2026 (developer.productboard.com) :
//   /reference/authentication, /reference/oauth-authorization-code (jeton de 24 h envoyé en
//     « Authorization: Bearer », voir oauth.ts pour le bouton)
//   /reference/listnotes (GET /v2/notes : pageCursor, archived, processed, type[], createdFrom,
//     createdTo, updatedFrom, updatedTo (bornes comprises, ISO 8601), fields[] ; aucun paramètre de tri
//     ni de taille de page : « triées par date de création, les plus récentes d'abord »)
//   /reference/getnote, /reference/glossary-note (note : id, type textNote | conversationNote |
//     opportunityNote, fields { name, content, tags, owner, creator… }, links { self, html },
//     createdAt, updatedAt ; content : HTML ou Markdown pour une note simple, prises de parole
//     { externalId, authorName, authorType customer | agent, content, timestamp } pour une
//     conversation, { id, name, value, fieldType } pour une opportunité)
//   /reference/pagination (links.next porte le pageCursor suivant ; absent : dernière page)
// Le droit est « notes:read ». Il faut un plan Pro ou supérieur pour utiliser l'API ; seul un Maker
// administrateur peut autoriser l'appli. Aucune limite de débit n'est documentée : 4 requêtes par
// seconde au plus, et le client HTTP reprend sur un 429.
//
// Écarts au plan, d'après la doc : l'API 2.0 est « en bêta » ; la liste ne se trie pas par
// modification, on lit donc toutes les notes modifiées depuis le curseur à chaque passage et on les
// trie ici (même approche qu'Attio). Les notes archivées ne sont pas lues. Une note sans date
// lisible est écartée. Le nom de l'auteur d'une note simple n'est pas rendu par l'API sans le droit
// des informations personnelles (members:pii:read, que Leon ne demande pas) : le tour `document` n'a
// pas de nom d'auteur ; une conversation donne le nom de chaque prise de parole.
//
// Non vérifié (aucun compte réel) : l'endroit des dates (racine de la note ou `fields`, les deux sont
// lues) ; que `updatedFrom` inclut bien l'instant donné (le curseur écarte les notes déjà vues à cet
// instant, juste dans les deux cas) ; que `updatedAt` d'une conversation avance quand une prise de
// parole s'ajoute ; la forme de `links.next` (adresse ou curseur seul, les deux sont lus) ; que
// `fields[]=name` est accepté par la vérification ; la durée de vie d'un curseur de page (1 minute en
// v1 : on lit les pages à la suite) ; le comportement de la dernière page (v1 renvoyait le premier
// curseur : un curseur déjà vu arrête la lecture).
// Le bouton « Se connecter avec Productboard » est le seul moyen de brancher l'outil dans ce jet.

// Aucune clé à coller : la configuration est toujours celle du bouton (jetons posés par le socle).
const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().trim().min(1).max(4000),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  workspace: z.string().trim().max(200).optional(), // nom de l'espace, lu pendant le branchement
});
type Config = z.infer<typeof ConfigSchema>;

export const productboardConnector: Connector<Config> = {
  id: 'productboard',
  configSchema: ConfigSchema,
  secretFields: [], // les jetons sont chiffrés par le socle OAuth
  hosts: () => ['api.productboard.com'],
  minIntervalMs: 250,
  oauth: productboardOAuth,

  async verify(config, http) {
    await productboardClient(config.accessToken, http).probe(new Date(Date.now() - 3_600_000));
    return { account: config.workspace ? `Productboard (${config.workspace})` : 'Productboard' };
  },

  sync(config, state, http) {
    return syncNotes(productboardClient(config.accessToken, http), config.workspace, state);
  },
};
