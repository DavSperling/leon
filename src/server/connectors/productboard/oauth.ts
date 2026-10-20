import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Productboard ». Doc lue le 15/10/2026 :
//   https://developer.productboard.com/reference/oauth-authorization-code (flux « code
//     d'autorisation » : adresse d'autorisation https://app.productboard.com/oauth2/authorize
//     (client_id, response_type, redirect_uri, state, code_challenge, code_challenge_method), adresse
//     de jeton POST https://app.productboard.com/oauth2/token avec client_id, client_secret,
//     grant_type, code, redirect_uri et code_verifier **en paramètres d'adresse** (la doc n'en montre
//     pas d'autre forme) ; PKCE S256 facultatif pour une appli confidentielle ; l'adresse de retour
//     doit être l'une de celles déclarées, au caractère près ; seul un Maker administrateur peut
//     autoriser l'appli ; accès de 24 h (expires_in 86400), jeton de rafraîchissement de 180 jours,
//     tournant : le renouvellement rend un nouveau jeton et l'ancien vaut encore 60 minutes ; erreurs
//     du jeton en JSON avec `error` (RFC 6749) ; page d'information du jeton
//     GET /oauth2/token/info?access_token=… : application, resource_owner, space { name, domain },
//     scopes, expires_in, created_at)
//   https://developer.productboard.com/reference/oauth-public-client (même serveur : le paramètre
//     `scope` y est documenté, séparé par des espaces, avec `notes:read` parmi les droits)
// Écart au plan : aucun sur les adresses, PKCE, durées ni le format. Le plan donne le droit `notes:read` ;
// la doc du flux ordinaire ne cite pas de paramètre `scope` (les droits se cochent à la création de
// l'appli, voir le guide) et le documente pour l'autre flux du même serveur : on l'envoie, il resserre
// l'accès si l'appli en a coché davantage.
//
// Non vérifié (aucun compte réel) : que l'adresse d'autorisation accepte `scope` ; que la page
// d'information du jeton rend bien `space.name` ; la forme d'un refus du jeton (la doc ne cite que
// `error`, ce qui suffit au socle).

const TokenInfoSchema = z.object({
  space: z.object({ name: z.string().nullish() }).nullish(),
});

export const productboardOAuth: OAuthSpec = {
  appKey: 'PRODUCTBOARD',
  authorizeUrl: 'https://app.productboard.com/oauth2/authorize',
  tokenUrl: 'https://app.productboard.com/oauth2/token',
  scopes: ['notes:read'],
  pkce: true,
  clientAuth: 'body',
  tokenBody: 'query',
  preFields: [],
  setupHosts: ['app.productboard.com'],

  // Le nom de l'espace ne sert qu'à nommer la connexion : s'il manque, on branche quand même.
  // Seul le nom est gardé (ni l'utilisateur, ni son adresse).
  async toConfig(tokens, _preFields, http) {
    try {
      const info = await http.json(
        {
          url: 'https://app.productboard.com/oauth2/token/info',
          query: { access_token: tokens.accessToken },
        },
        TokenInfoSchema,
      );
      const workspace = info.space?.name?.trim();
      return workspace ? { workspace } : {};
    } catch (error) {
      if (error instanceof ConnectorHttpError || error instanceof ConnectorAuthError) return {};
      throw error;
    }
  },
};
