import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec monday.com ». Doc lue le 15/10/2026 :
//   https://developer.monday.com/apps/docs/oauth (flux « legacy » : adresse de jeton
//     https://auth.monday.com/oauth2/token, jeton qui n'expire jamais, pas de rafraîchissement, pas de
//     PKCE, format du corps non documenté) et
//   https://developer.monday.com/apps/docs/migrating-to-the-new-oauth-flow (flux OAuth 2.1, celui
//     que la doc conseille pour toute nouvelle intégration) :
//     adresse d'autorisation https://auth.monday.com/oauth2/authorize (inchangée, droits séparés par
//     des espaces, `state` rendu tel quel) ; adresse de jeton https://auth.monday.com/oauth_ms/oauth/token,
//     corps JSON, client_id et client_secret dans le corps (client_secret_post) ; PKCE S256 obligatoire ;
//     jeton d'accès qui expire (échéance dans le claim `exp` du jeton, aucun `expires_in` à l'échange) ;
//     jeton de rafraîchissement tournant (« discard the old one ») ; « sur un 401, renouveler et
//     recommencer » ; le flux se choisit par version de l'appli (réglage « New OAuth Flow » de l'onglet
//     OAuth & Permissions du Developer Center).
//   https://auth.monday.com/oauth_ms/.well-known/oauth-authorization-server (mêmes adresses, PKCE S256
//     seul, client_secret_post et client_secret_basic, droits `boards:read`, `updates:read` et
//     `me:read` au catalogue).
//   https://developer.monday.com/apps/docs/oauth, relu le 23/10/2026 : écriture demandée d'avance,
//     `boards:write` (« Modify a user's board data ») et `updates:write` (« Post or edit updates »).
//     Pas de droit plus étroit : d'après https://developer.monday.com/api-reference/reference/items et
//     .../updates, ces mêmes droits permettent aussi d'archiver et de supprimer (à Leon de s'en garder).
// Écart au plan : le plan dit « jeton sans expiration » (flux legacy). La doc conseille le nouveau flux
// pour une nouvelle intégration, et c'est le seul dont le corps de l'échange est documenté : adresse de
// jeton différente, PKCE, corps JSON, jetons qui expirent et se renouvellent (sur 401, faute
// d'`expires_in`). Il faut donc activer « New OAuth Flow » sur la version de l'appli.
// Non vérifié (aucune appli réelle) : si les champs imbriqués que le connecteur lit exigent des droits
// de plus que les trois du plan (`account { name }` de `me` : `account:read` ; `creator { name email }` :
// `users:read` ; `board { workspace }` : `workspaces:read`) ; la doc ne les rattache qu'à la requête
// racine. Si un branchement échoue sur un refus de droits, les ajouter ici. Non vérifié aussi : que le
// jeton d'accès du bouton s'envoie sans « Bearer » comme la clé (les exemples de la doc le montrent
// ainsi) ; que l'outil répond 401 (ou l'erreur « Unauthorized » en 200) à un jeton expiré.

export const mondayOAuth: OAuthSpec = {
  appKey: 'MONDAY',
  authorizeUrl: 'https://auth.monday.com/oauth2/authorize',
  tokenUrl: 'https://auth.monday.com/oauth_ms/oauth/token',
  scopes: ['boards:read', 'updates:read', 'me:read', 'boards:write', 'updates:write'], // Leon n'écrit pas encore : l'accès est demandé d'avance
  pkce: true,
  clientAuth: 'body',
  tokenBody: 'json',
  preFields: [],
  setupHosts: [],
  // monday.com n'a rien de plus à retenir que les jetons : le compte vient de `verify`.
  toConfig: async () => ({}),
};
