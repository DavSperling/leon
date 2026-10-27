import type { OAuthSpec } from '../types';
import { githubClient } from './client';

// Le bouton « Se connecter avec GitHub » : une GitHub App (pas une appli OAuth, dont le droit `repo`
// donnerait l'écriture sur tous les dépôts privés). Ses permissions sont celles de l'appli, réglées
// dans sa console : Issues et Pull requests en lecture et écriture (l'écriture demandée d'avance, #40),
// Metadata en lecture. Le jeton obtenu est un jeton utilisateur (ghu_…) : il n'ouvre que les dépôts où
// l'appli est installée ET que l'utilisateur voit.
//
// Doc lue le 15/10/2026 :
//   https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
//   https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
//   https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
//   https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
//   https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
// Adresse d'autorisation : https://github.com/login/oauth/authorize. Adresse de jeton :
// POST https://github.com/login/oauth/access_token (réponse JSON avec `Accept: application/json`,
// que le client HTTP envoie). Le renouvellement passe par la même adresse (grant_type=refresh_token).
//
// Écarts avec le plan, d'après la doc :
// - PKCE : la doc le prend en charge et le recommande (S256 seulement, `plain` n'existe pas) pour une
//   GitHub App ; le plan n'en parlait pas. On l'active.
// - Aucun paramètre `scope` : « Unlike OAuth apps, GitHub Apps do not request scopes during
//   authorization ». Le seul scope admis, `offline_access`, ne règle pas des droits mais demande un
//   jeton qui expire ; il est inutile tant que l'option « Expire user authorization tokens » de
//   l'appli reste cochée (elle l'est par défaut, et le guide dit de la laisser ainsi). Décochée, le
//   jeton n'expire pas : la réponse n'a ni `expires_in` ni `refresh_token`, et la connexion tient
//   (`expiresAt` nul).
// - Jeton d'accès de 8 h (`expires_in` 28800), jeton de rafraîchissement de 6 mois, à usage unique :
//   chaque renouvellement en rend un nouveau (le socle l'enregistre avant le passage).
// - Dans la console de l'appli, laisser décochée « Request user authorization (OAuth) during
//   installation » : GitHub renverrait alors vers l'adresse de retour sans `state` ni cookie.
//   L'adresse de retour ne peut pas porter de paramètre (la nôtre n'en porte aucun).
//
// Non vérifié, sans appel réel : que l'échange accepte `grant_type=authorization_code` en plus de
// ses paramètres documentés (le socle l'envoie toujours ; GitHub ignore les paramètres inconnus) ;
// que le corps d'erreur reste en 200 (le socle lit `error` quel que soit le statut) ; que le
// formulaire (`application/x-www-form-urlencoded`) soit accepté à la place des paramètres d'adresse
// que montre la doc du renouvellement.

export const githubOAuth: OAuthSpec = {
  appKey: 'GITHUB',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: [],
  pkce: true,
  clientAuth: 'body',
  preFields: [],
  setupHosts: [],
  // Sans lui, GitHub branche en silence le compte déjà ouvert dans le navigateur, s'il a déjà accepté
  // l'appli : chaque compte Leon créé sur ce navigateur recevait le même GitHub. Doc lue le 27/10/2026 :
  // « Forces the account picker to appear if set to select_account » (page du jeton utilisateur, plus haut).
  extraAuthorizeParams: { prompt: 'select_account' },

  // Branché sans aucun dépôt ouvert : on enchaîne sur l'écran d'installation de l'appli, où
  // l'utilisateur choisit ses dépôts ; GitHub le renvoie ensuite à la « Setup URL » de l'appli (la page
  // Connexions de Leon). Le nom court de l'appli (github.com/apps/<nom>) n'est pas dans la réponse de
  // GitHub : on le règle. Sans lui, on revient à Leon et l'utilisateur installe l'appli lui-même.
  async nextStep(config, http) {
    const slug = process.env.LEON_OAUTH_GITHUB_APP?.trim();
    const { accessToken, repos } = config;
    if (!slug || (Array.isArray(repos) && repos.length > 0)) return null;
    const installed = await githubClient(String(accessToken ?? ''), http).installedRepos(1);
    return installed.length > 0
      ? null
      : `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
  },

  // Rien à demander avant le clic : les dépôts sont ceux où l'utilisateur installe l'appli sur
  // GitHub, relus à chaque passage (voir `reposToRead`).
  async toConfig() {
    return {};
  },
};
