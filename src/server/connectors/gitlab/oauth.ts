import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec GitLab » (gitlab.com seulement).
// Doc lue le 15/10/2026 :
//   https://docs.gitlab.com/api/oauth2/                        (adresses, PKCE, échange, renouvellement)
//   https://docs.gitlab.com/integration/oauth_provider/        (création de l'appli, portées)
//   https://docs.gitlab.com/api/rest/authentication/           (en-tête Authorization, durée du jeton)
// Ce que dit la doc :
//   - autorisation `https://gitlab.com/oauth/authorize`, jetons `https://gitlab.com/oauth/token`, en
//     formulaire (`application/x-www-form-urlencoded`) ; PKCE S256 avec un vérificateur de 43 à 128
//     caractères ; `client_id` et `client_secret` en paramètres ou en Basic, jamais les deux (400) ;
//   - portée `read_api` : « lecture de l'API, y compris tous les groupes et projets » ; GitLab ne
//     permet pas de la limiter à certains projets, c'est Leon qui ne lit que ceux de la liste ;
//   - jeton d'accès de 2 h (`expires_in` 7200) ; chaque renouvellement invalide l'ancien jeton
//     d'accès ET l'ancien jeton de rafraîchissement et en rend de nouveaux (usage unique, c'est
//     pourquoi le socle enregistre les nouveaux avant le passage) ;
//   - le jeton OAuth se présente en `Authorization: Bearer <jeton>` (jamais aussi dans l'adresse :
//     400), pas en `PRIVATE-TOKEN`, que la doc réserve aux jetons personnels, de projet et de groupe ;
//   - la réponse de l'échange ne porte pas de champ `scope` : `tokens.scope` reste nul.
// Écarts avec le plan : aucun sur les adresses, la portée, le PKCE, la durée ni `preFields`. Deux
// détails que le plan ne prévoyait pas :
//   - la doc écrit `redirect_uri` dans l'exemple de renouvellement ; le socle ne l'y met pas
//     (RFC 6749, § 6 ne l'exige pas), faute de pouvoir l'écrire dans une description fixe ;
//   - l'exemple PKCE de la doc n'envoie pas `client_secret` (appli publique) ; Leon crée une appli
//     « confidentielle » (case cochée par défaut) et envoie le secret avec les paramètres.
export const gitlabOAuth: OAuthSpec = {
  appKey: 'GITLAB',
  authorizeUrl: 'https://gitlab.com/oauth/authorize',
  tokenUrl: 'https://gitlab.com/oauth/token',
  scopes: ['read_api'],
  pkce: true,
  clientAuth: 'body',
  tokenBody: 'form',
  preFields: ['projects'],
  setupHosts: [],

  // Rien à demander à GitLab : les projets viennent du formulaire d'avant le clic.
  async toConfig(_tokens, preFields) {
    return { projects: preFields.projects };
  },
};
