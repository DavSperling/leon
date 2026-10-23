import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Attio ». Doc lue le 15/10/2026 :
//   https://docs.attio.com/rest-api/tutorials/connect-an-app-through-oauth (le déroulé complet :
//     autorisation `https://app.attio.com/authorize` avec response_type=code, client_id,
//     redirect_uri, state ; jeton par `POST https://app.attio.com/oauth/token`, formulaire
//     `application/x-www-form-urlencoded` avec grant_type=authorization_code, code, redirect_uri,
//     client_id et client_secret ; les droits se règlent dans la console des développeurs, onglet
//     des droits, pas dans l'adresse d'autorisation)
//   https://docs.attio.com/docs/oauth/authorize (token_level `workspace` par défaut ou `user` ;
//     code_challenge et code_challenge_method=S256 facultatifs, exigés seulement pour `user`)
//   https://docs.attio.com/docs/oauth/token (code_verifier exigé si un code_challenge a été envoyé ;
//     réponse : `access_token` et `token_type` « Bearer », rien d'autre)
//   https://docs.attio.com/rest-api/guides/authentication (jeton en `Authorization: Bearer` ; seuls
//     les administrateurs de l'espace peuvent accorder un jeton d'espace)
//   https://docs.attio.com/rest-api/endpoint-reference/meta/identify (« Attio access tokens do not
//     currently expire » : `exp` est toujours nul)
//   https://docs.attio.com/share/the-publication-lifecycle (une appli non publiée s'installe dans
//     25 espaces au plus, par le flux OAuth ou par invitation, avec un avertissement « pas encore
//     approuvée par Attio » ; la revue d'Attio lève la limite et l'avertissement)
//
// Un jeton d'espace qui n'expire pas, sans jeton de rafraîchissement : `expiresAt` et `refreshToken`
// restent nuls, le socle ne le renouvelle jamais ; un 401 en plein passage met la connexion en
// « Reconnectez Attio ».
//
// Écarts au plan, d'après la doc : Attio n'a pas de paramètre `scope` dans l'adresse d'autorisation,
// d'où `scopes: []`. Les droits se cochent dans la console de l'appli (ceux du jeton collé :
// user_management:read, object_configuration:read, record_permission:read ; et, demandés d'avance
// bien que Leon n'écrive pas encore, note:read-write et comment:read-write, relus le 23/10/2026 sur
// https://docs.attio.com/rest-api/endpoint-reference/notes/create-a-note et .../comments/create-a-comment ;
// note:read-write permet aussi de supprimer une note) ; le guide des applis (T62) les reprend d'ici. `token_level=workspace` est la valeur
// par défaut, écrite pour que le jeton lise tout l'espace et non un seul membre. PKCE est facultatif
// pour un jeton d'espace : on l'envoie, puisque le socle le fait partout où l'éditeur le permet.
//
// Non vérifié (aucune appli réelle) : le paramètre `error` d'un refus de l'utilisateur et la forme
// d'un code refusé à l'échange (la doc d'Attio n'en dit rien ; le socle traite `access_denied` comme
// une annulation et tout autre `error` comme un refus) ; que `GET /v2/self` rende `workspace_name`
// avec un jeton du bouton comme avec un jeton collé.
export const attioOAuth: OAuthSpec = {
  appKey: 'ATTIO',
  authorizeUrl: 'https://app.attio.com/authorize',
  tokenUrl: 'https://app.attio.com/oauth/token',
  scopes: [], // fixés dans la console de l'appli, pas dans l'adresse
  pkce: true,
  clientAuth: 'body',
  extraAuthorizeParams: { token_level: 'workspace' },
  preFields: [],
  setupHosts: [],
  // Rien à ajouter : l'espace se lit à la vérification et à chaque passage (GET /v2/self).
  toConfig: async () => ({}),
};
