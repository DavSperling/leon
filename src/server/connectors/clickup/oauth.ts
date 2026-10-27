import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec ClickUp ». Doc lue le 15/10/2026 :
//   https://developer.clickup.com/docs/authentication (flux « code d'autorisation » :
//     autorisation `https://app.clickup.com/api?client_id&redirect_uri&state`, jeton par
//     l'« Access Token URL » ci-dessous ; l'utilisateur autorise un ou plusieurs espaces de travail ;
//     aucun droit à demander, aucun jeton de rafraîchissement : « l'accès currently does not
//     expire », sous réserve de changement ; jeton envoyé en `Authorization: Bearer <jeton>`)
//   https://developer.clickup.com/reference/getaccesstoken (POST /api/v2/oauth/token, sans
//     authentification ; corps JSON ou formulaire : `client_id`, `client_secret`, `code` ;
//     réponse `{ "access_token": "…" }`, aucune erreur documentée)
//
// Un jeton sans expiration ni rafraîchissement : `expiresAt` reste nul, le socle ne le renouvelle
// jamais ; un 401 en plein passage met la connexion en « Reconnect ClickUp ».
export const clickupOAuth: OAuthSpec = {
  appKey: 'CLICKUP',
  authorizeUrl: 'https://app.clickup.com/api',
  tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
  scopes: [], // ClickUp n'a pas de droits : l'utilisateur choisit les espaces pendant l'autorisation
  pkce: false,
  clientAuth: 'body',
  tokenBody: 'json',
  preFields: [],
  setupHosts: [],
  // Rien à ajouter : les espaces se lisent à la vérification et à chaque passage (GET /v2/team).
  toConfig: async () => ({}),
};
