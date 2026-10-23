import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Linear ». Doc lue le 15/10/2026 :
//   https://linear.app/developers/oauth-2-0-authentication
//     adresse d'autorisation https://linear.app/oauth/authorize, adresse de jeton
//     https://api.linear.app/oauth/token (formulaire, client_id et client_secret avec les paramètres) ;
//     droits séparés par des virgules, « read » par défaut ; actor=user (par défaut) ; PKCE S256
//     (client_secret devient alors facultatif, on l'envoie quand même : l'appli est confidentielle) ;
//     jeton d'accès de 24 h (expires_in 86399) ; renouvellement avec grant_type=refresh_token, qui
//     rend un nouveau jeton de rafraîchissement (l'ancien se rejoue 30 minutes si la réponse s'est
//     perdue) ; jeton envoyé en « Authorization: Bearer <jeton> ».
//   https://linear.app/developers/graphql (la clé personnelle, elle, s'envoie sans « Bearer »)
// Écart au plan : aucun.

export const linearOAuth: OAuthSpec = {
  appKey: 'LINEAR',
  authorizeUrl: 'https://linear.app/oauth/authorize',
  tokenUrl: 'https://api.linear.app/oauth/token',
  scopes: ['read', 'write'], // write : Leon n'écrit pas encore, l'accès est demandé d'avance
  scopeSeparator: ',',
  pkce: true,
  clientAuth: 'body',
  extraAuthorizeParams: { actor: 'user' },
  preFields: [],
  setupHosts: [],
  // Linear n'a rien de plus à retenir que les jetons.
  toConfig: async () => ({}),
};
