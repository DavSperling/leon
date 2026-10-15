import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Help Scout ». Doc lue le 15/10/2026 :
//   https://developer.helpscout.com/mailbox-api/overview/authentication/ (flux « Authorization Code »)
//     adresse d'autorisation https://secure.helpscout.net/authentication/authorizeClientApplication
//     avec `client_id` et un `state` facultatif (rendu au retour) ; aucun paramètre `redirect_uri` ni
//     `scope` : l'adresse de retour est celle saisie dans « Your Profile › My apps », et l'API n'a pas
//     de droits à demander (le jeton suit les droits de l'utilisateur) ; PKCE : non mentionné ;
//     adresse de jeton POST https://api.helpscout.net/v2/oauth2/token, `code`, `client_id`,
//     `client_secret` et `grant_type=authorization_code` « en JSON, formulaire ou paramètres
//     d'adresse » (les exemples sont en formulaire : c'est ce que le socle envoie par défaut) ;
//     réponse { refresh_token, token_type: « bearer », access_token, expires_in: 172800 } ;
//     renouvellement sur un 401 de l'API, avec `refresh_token`, `client_id`, `client_secret` et
//     `grant_type=refresh_token`, qui rend un nouveau couple de jetons (le socle garde le dernier) ;
//     jeton envoyé en « Authorization: Bearer <jeton> » ; « il faut un utilisateur actif et invité du
//     compte » (sinon 401).
//
// Écarts au plan : le jeton d'accès dure deux jours (172800 s), pas deux heures ; la doc ne dit pas
// que le jeton de rafraîchissement est à usage unique, mais comme elle en rend un nouveau à chaque
// renouvellement, le socle l'enregistre avant le passage (point de vigilance 2). Le socle ajoute
// `redirect_uri` et `response_type=code` à l'adresse d'autorisation, et `redirect_uri` à l'échange :
// la doc n'en parle pas pour Help Scout (elle ne les décrit pas, on suppose qu'ils sont ignorés).
//
// Non vérifié (aucune appli réelle) : que ces paramètres en plus sont ignorés ; la forme d'un refus
// (400 ou 401) à l'échange ou au renouvellement, que la doc ne décrit pas : le socle ne reconnaît un
// refus que par `error`, sans lui la réponse est « inattendue » et le passage réessaie dans 1 h au
// lieu de demander de reconnecter ; si le jeton de rafraîchissement est à usage unique, et sa durée
// de vie ; si un utilisateur d'un autre compte Help Scout peut autoriser une appli créée dans un
// autre compte (la doc dit seulement que ce flux sert aux intégrations « pour d'autres
// utilisateurs ») ; que l'adresse de retour de « My apps » peut être en http://localhost.

export const helpscoutOAuth: OAuthSpec = {
  appKey: 'HELPSCOUT',
  authorizeUrl: 'https://secure.helpscout.net/authentication/authorizeClientApplication',
  tokenUrl: 'https://api.helpscout.net/v2/oauth2/token',
  scopes: [],
  pkce: false,
  clientAuth: 'body',
  preFields: [],
  setupHosts: [],
  // Help Scout n'a rien de plus à retenir que les jetons : le compte s'affiche par `verify`.
  toConfig: async () => ({}),
};
