import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Airtable ». Doc lue le 15/10/2026 :
//   https://airtable.com/developers/web/api/oauth-reference (adresses, PKCE, échange, renouvellement)
//   https://airtable.com/developers/web/api/scopes          (noms des droits)
//   https://airtable.com/developers/web/api/get-user-id-scopes (GET /v0/meta/whoami)
// Ce que dit la doc :
//   - autorisation `https://airtable.com/oauth2/v1/authorize`, jetons `https://airtable.com/oauth2/v1/token`,
//     en formulaire (`application/x-www-form-urlencoded`) ;
//   - PKCE S256 obligatoire (vérificateur de 43 à 128 caractères, `state` de 16 à 1 024 caractères
//     parmi `a-z A-Z 0-9 . - _`) ; droits séparés par des espaces, au moins un ;
//   - appli avec secret : `Authorization: Basic` obligatoire, `client_id` facultatif dans le corps ;
//     le socle (`clientAuth: 'basic'`) ne l'y met pas ;
//   - le code vaut 10 minutes et une seule fois, même si l'échange échoue ;
//   - jeton d'accès de 60 minutes (`expires_in` 3600), jeton de rafraîchissement de 60 jours,
//     remis à zéro à chaque renouvellement ; chaque renouvellement invalide l'ancien jeton d'accès ET
//     l'ancien jeton de rafraîchissement et en rend de nouveaux (usage unique : le socle enregistre les
//     nouveaux avant le passage) ; la doc ne parle d'aucune période de grâce ;
//   - erreurs de l'échange : 400 (`invalid_request`, `invalid_grant`, `unsupported_grant_type`), 401
//     (`invalid_client`), 409 (renouvellement trop rapproché d'un précédent : l'erreur remonte telle
//     quelle, nouvel essai dans 1 h) ;
//   - le jeton d'accès s'envoie en `Authorization: Bearer <jeton>`, comme un jeton personnel ;
//   - droits : `data.records:read` (enregistrements), `data.recordComments:read` (commentaires),
//     `schema.bases:read` (liste des bases et structure des tables). `whoami` ne demande aucun droit,
//     mais ne rend l'adresse e-mail qu'avec `user.email:read`, que nous ne demandons pas : le compte
//     affiché est alors l'identifiant Airtable, suivi des bases lues.
// Écarts avec le plan : aucun sur les adresses, les droits, le PKCE ni le secret en Basic. Un détail
// que le plan ne prévoyait pas : la doc écrit « base64 url-encoding » pour l'identifiant et le secret
// du Basic ; le socle utilise le base64 usuel de HTTP, et rien ne laisse penser qu'Airtable attende
// autre chose.
//
// Les bases (`bases`) se choisissent avant le clic, et sont facultatives : vides, Leon lit toutes les
// bases que l'utilisateur autorise chez Airtable (20 au plus). Airtable laisse choisir les bases
// pendant l'autorisation ; ce champ ne fait que restreindre encore.
export const airtableOAuth: OAuthSpec = {
  appKey: 'AIRTABLE',
  authorizeUrl: 'https://airtable.com/oauth2/v1/authorize',
  tokenUrl: 'https://airtable.com/oauth2/v1/token',
  scopes: [
    'data.records:read',
    'schema.bases:read',
    'data.recordComments:read',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'data.records:write',
    'data.recordComments:write',
  ],
  pkce: true,
  clientAuth: 'basic',
  tokenBody: 'form',
  preFields: [],
  setupHosts: [],

  // Rien à demander avant le clic : les bases se choisissent sur l'écran d'autorisation d'Airtable.
  async toConfig() {
    return { bases: [] };
  },
};
