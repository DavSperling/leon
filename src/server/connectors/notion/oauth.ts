import type { OAuthSpec } from '../types';

// Notion : le bouton « Se connecter avec Notion » (intégration publique).
//
// Doc lue le 15/10/2026 :
//   https://developers.notion.com/guides/get-started/authorization (flux des connexions publiques :
//     adresse d'autorisation, owner=user, secret en Basic, corps JSON, page choisie par l'utilisateur)
//   https://developers.notion.com/reference/create-a-token (POST /v1/oauth/token, code contre jetons)
//   https://developers.notion.com/reference/refresh-a-token (même adresse, grant_type=refresh_token)
//   https://developers.notion.com/reference/status-codes (forme et codes des erreurs)
//
// Choix. Aucun droit à demander : les droits sont les capacités cochées sur la connexion dans le
// portail Notion (lire le contenu, les commentaires, les personnes avec leur adresse e-mail), et
// l'utilisateur choisit les pages à partager pendant l'autorisation (aucun paramètre scope). Pas de
// PKCE : la doc n'en parle pas. La réponse de jeton ne porte ni `expires_in` ni durée : `expiresAt`
// reste nul, et le socle ne renouvelle qu'au premier refus (401) d'un passage. Le renouvellement rend
// un nouveau jeton d'accès ET un nouveau jeton de rafraîchissement, que le socle enregistre avant le
// passage. `toConfig` ne rappelle personne : la réponse de jeton donne déjà l'espace et le robot.
//
// Forme d'un refus, tranchée par la doc : { object: 'error', status, code, message }, en 400
// (invalid_grant, invalid_request…) ou en 401 (invalid_client), sans `error` ni `error_description`.
// Le socle (`requestTokens`) la compte comme un refus : au retour, le code est `refuse`, et un jeton
// de rafraîchissement refusé met la connexion en 'auth_error' (« Reconnectez Notion »).
//
// Non vérifié : l'en-tête Notion-Version, que la référence marque obligatoire sur /v1/oauth/token
// alors que le guide d'autorisation n'en met dans aucun exemple (le socle n'en envoie pas) ; la
// durée de vie du jeton d'accès ; un essai en réel.

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export const notionOAuth: OAuthSpec = {
  appKey: 'NOTION',
  authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
  tokenUrl: 'https://api.notion.com/v1/oauth/token',
  scopes: [],
  pkce: false,
  clientAuth: 'basic',
  tokenBody: 'json',
  extraAuthorizeParams: { owner: 'user' },
  preFields: [],
  setupHosts: [],
  // On garde le nom de l'espace (pour l'affichage) et l'identifiant du robot ; ni le propriétaire
  // (nom et adresse e-mail d'une personne), ni l'icône, ni le reste de la réponse.
  toConfig: async (tokens) => ({
    workspaceName: textOrNull(tokens.raw.workspace_name),
    botId: textOrNull(tokens.raw.bot_id),
  }),
};
