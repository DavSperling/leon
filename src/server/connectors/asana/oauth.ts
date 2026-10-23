import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Asana ». Doc lue le 15/10/2026 :
//   https://developers.asana.com/docs/oauth (adresses, paramètres, PKCE, échange et renouvellement),
//   https://developers.asana.com/docs/oauth-scopes (droits par point d'accès),
//   et le fichier OpenAPI officiel github.com/Asana/openapi (defs/asana_oas.yaml : droit exigé par
//   chaque opération, adresses d'autorisation et de jeton).
//
// - Autorisation : GET https://app.asana.com/-/oauth_authorize (client_id, redirect_uri,
//   response_type=code, state, scope séparé par des espaces, code_challenge et code_challenge_method=S256).
// - Jeton : POST https://app.asana.com/-/oauth_token, formulaire (`application/x-www-form-urlencoded`),
//   client_id et client_secret avec les paramètres, code_verifier avec PKCE. Même adresse pour le
//   renouvellement (grant_type=refresh_token). Jeton d'accès valable 1 h (`expires_in` 3600).
// - Les droits se déclarent dans la console de l'appli, et seuls les droits déclarés se demandent
//   (sinon `forbidden_scopes`) : l'appli doit être inscrite avec « droits précis », pas « accès
//   complet » (qui interdit de demander des droits un à un). Voir le guide des applis (T62).
// - Droits, un par point d'accès lu : tasks:read (GET /tasks), projects:read (GET /projects),
//   stories:read (GET /tasks/{gid}/stories, les commentaires), users:read (GET /users/me).
// - Écriture demandée d'avance (relu le 23/10/2026 sur https://developers.asana.com/docs/oauth-scopes) :
//   tasks:write (POST /tasks, PUT /tasks/{gid}) et stories:write (POST /tasks/{gid}/stories, commenter).
//   La suppression a ses propres droits (tasks:delete, projects:delete), jamais demandés. Pas de
//   projects:write : Leon ne change pas la structure des projets.
//
// Écarts au plan, d'après la doc : `stories:read` s'ajoute aux trois droits du plan, car les
// commentaires d'une tâche en ont besoin. PKCE est facultatif chez Asana (« conditionnel » dans la
// doc) : on l'envoie, puisque le plan le demande et que l'éditeur le prend en charge.
// Contradiction dans la doc : l'exemple de l'échange est écrit en JSON, mais le texte exige un
// formulaire ; on envoie un formulaire.
//
// Non vérifié (aucune appli réelle) : si le renouvellement rend un nouveau `refresh_token` (la doc ne
// le dit pas ; le socle garde l'ancien s'il est absent, et prend le nouveau s'il est rendu) ; le
// paramètre `error` d'un refus de l'utilisateur (non documenté ; le socle traite `access_denied`
// comme une annulation et tout autre `error` comme un refus) ; que `workspaces.name` de GET
// /users/me demande seulement users:read ; que GET /users/me, absent de la liste des droits, soit
// bien couvert par users:read (la doc d'Asana le traite comme GET /users/{user_gid}, qui l'exige).
export const asanaOAuth: OAuthSpec = {
  appKey: 'ASANA',
  authorizeUrl: 'https://app.asana.com/-/oauth_authorize',
  tokenUrl: 'https://app.asana.com/-/oauth_token',
  scopes: [
    'tasks:read',
    'projects:read',
    'stories:read',
    'users:read',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'tasks:write',
    'stories:write',
  ],
  pkce: true,
  clientAuth: 'body',
  preFields: ['workspace'], // facultatif : l'espace à lire, sinon le premier du compte
  setupHosts: [],
  // L'espace choisi avant le clic est le seul champ propre à Asana ; la réponse de jeton porte aussi
  // le profil de l'utilisateur (nom, adresse), dont on n'emporte rien.
  async toConfig(_tokens, preFields) {
    const workspace = preFields.workspace;
    return typeof workspace === 'string' && workspace !== '' ? { workspace } : {};
  },
};
