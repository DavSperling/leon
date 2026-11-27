import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Trello » : le client OAuth 2.0 (3LO) « Confidential » de Leon, créé sur
// trello.com/apps/admin, onglet « OAuth 2.0 ». Ce n'est pas l'appli Atlassian de Jira et Confluence : son
// identifiant, son secret et ses droits sont à part.
//
// Doc lue le 27/11/2026 :
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/oauth-2-confidential-client-usage
//     autorisation https://auth.atlassian.com/authorize : client_id, scope (séparés par une espace ; offline_access
//     pour avoir un jeton de rafraîchissement), redirect_uri, response_type=code, prompt=consent, code_challenge,
//     code_challenge_method=S256 ; échange du code et renouvellement en JSON (client_id, client_secret, grant_type,
//     redirect_uri, code, code_verifier ; puis refresh_token) ; jeton d'accès d'une heure (expires_in 3600), jeton de
//     rafraîchissement de 90 jours et à usage unique : le nouveau de chaque réponse remplace l'ancien ; refus en
//     { error, error_description } ; appels en « Authorization: Bearer ».
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/oauth-2-client-configuration/
//     client « Confidential » (avec secret) pour une appli qui a un serveur ; plusieurs adresses de retour possibles ;
//     droits cochés sur le client (offline_access ne se coche pas) ; un client de Power-Up limite read:board et
//     write:board à un seul espace de travail, pas celui d'une appli qui n'est pas un Power-Up.
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/oauth-2-for-existing-apps
//   https://community.developer.atlassian.com/t/oauth-2-0-3lo-is-now-available-for-trello/102691 (15/09/2026 :
//     authorization_code et refresh_token seulement)
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/ (un webhook se crée par
//     https://api.trello.com/1/webhooks avec le jeton Bearer ; read:board:trello pour un tableau)
//
// Tranché ici, faute d'une doc nette :
//   - l'adresse de jeton : https://auth.atlassian.com/oauth/token, celle de la référence et du code d'exemple de la
//     page (son texte écrit aussi …/authorize/oauth/token, sans doute une coquille) ;
//   - aucune `audience` : la page des clients confidentiels ne la cite pas, contrairement à Jira et Confluence
//     (api.atlassian.com), dont l'API n'est pas celle de Trello ;
//   - l'hôte de l'API reste api.trello.com, celui des exemples Bearer de la référence et du guide des webhooks (les
//     guides OAuth appellent trello.com/1) ;
//   - les droits : read:board:trello (cartes, listes, commentaires, et le webhook d'un tableau), read:member:trello
//     (le compte et ses tableaux), write:board:trello demandé d'avance pour écrire des cartes.
//
// Non vérifié (aucun essai réel) : tout le parcours ; que /1/members/me/boards réponde avec ces droits ; ce qui fait
// d'un client de trello.com/apps/admin un Power-Up (dont chaque jeton ne verrait qu'un espace de travail) ou une appli.

export const trelloOAuth: OAuthSpec = {
  appKey: 'TRELLO',
  authorizeUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  scopes: ['read:board:trello', 'write:board:trello', 'read:member:trello', 'offline_access'],
  pkce: true,
  clientAuth: 'body',
  tokenBody: 'json',
  extraAuthorizeParams: { prompt: 'consent' },
  preFields: [],
  setupHosts: [],
  // Trello n'a rien de plus à retenir que les jetons : le compte vient de `verify`.
  toConfig: async () => ({}),
};
