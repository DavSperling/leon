import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Miro ». Doc lue le 15/10/2026 :
//   https://developers.miro.com/docs/getting-started-with-oauth (adresse d'autorisation
//     `https://miro.com/oauth/authorize` : response_type, client_id, redirect_uri ; jeton par
//     `POST https://api.miro.com/v1/oauth/token`, tous les paramètres dans l'adresse ; jetons de
//     1 h et jeton de rafraîchissement de 60 jours, qui tourne ; l'adresse de retour doit être
//     celle de la console, à l'identique)
//   https://developers.miro.com/reference/exchange-authorization-code-with-access-token (spec :
//     grant_type, client_id, client_secret, code, redirect_uri, tous « in: query », aucun corps ;
//     réponse access_token, refresh_token, expires_in, scope, team_id, user_id, token_type ;
//     la spec n'y décrit que le 400 « Failed to exchange the authorization code »)
//   https://developers.miro.com/docs/troubleshooting-oauth20 (code invalide ou adresse de retour
//     qui ne correspond pas : « 4XX », avec en exemple un 401 de code `oauthError`, corps
//     { status, code, message, type: 'error' } ; message « Invalid authorization code: … » ou
//     « Redirect URI mismatch. » ; le jeton de rafraîchissement, à usage unique, devient invalide
//     une fois utilisé, à la désinstallation de l'appli ou si l'accès est retiré, sans corps décrit)
//   https://developers.miro.com/reference/create-authorization-request-link (state facultatif,
//     rendu tel quel ; team_id facultatif, qui ne fait que présélectionner l'équipe affichée)
//   https://developers.miro.com/reference/scopes (boards:read lit tableaux et éléments ; relu le
//     23/10/2026 : boards:write, « Create, update, or delete boards, board members, or items », coché
//     d'avance dans la console bien que Leon n'écrive pas encore ; il permet aussi de supprimer)
//
// Écarts au plan, d'après la doc. Aucun paramètre `scope` : l'adresse d'autorisation n'en a pas,
// les droits (boards:read et boards:write) se règlent dans la console de l'appli, section des
// permissions. Pas de PKCE : la doc n'en parle pas. L'équipe où l'appli est installée n'est pas
// choisie par Leon mais par l'utilisateur chez Miro, et rendue dans la réponse (`team_id`).
//
// Les jetons qui expirent sont une option à choisir à la création de l'appli, qu'on ne peut plus
// changer ensuite : sans elle, la réponse n'a ni `refresh_token` ni `expires_in`, le jeton dure
// jusqu'à la désinstallation de l'appli, et le socle ne le renouvelle jamais.
//
// Le refus de Miro n'a pas la forme de la RFC 6749 : aucun champ `error`, mais { status, code, message,
// type: 'error' }. Le socle (`requestTokens`) le compte comme un refus : au retour, le code est `refuse`,
// et un renouvellement refusé met la connexion en 'auth_error' (« Reconnectez Miro »).
//
// Non vérifié : le renouvellement, que la page de référence montre en formulaire alors que le guide
// et la spec de l'échange l'envoient dans l'adresse (le socle n'a qu'un mode par outil : adresse) ;
// le corps d'un refus au renouvellement (la doc n'en décrit aucun) ; si Miro accepte une adresse de
// retour en http://localhost ; un essai en réel.

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export const miroOAuth: OAuthSpec = {
  appKey: 'MIRO',
  authorizeUrl: 'https://miro.com/oauth/authorize',
  tokenUrl: 'https://api.miro.com/v1/oauth/token',
  scopes: [],
  pkce: false,
  clientAuth: 'body',
  tokenBody: 'query',
  preFields: [],
  setupHosts: [],
  // On garde l'équipe (les tableaux se listent par équipe) ; ni l'utilisateur, ni le reste.
  toConfig: async (tokens) => ({ teamId: textOrNull(tokens.raw.team_id) }),
};
