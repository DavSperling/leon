import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec HubSpot ». Doc lue le 15/10/2026 (developers.hubspot.com) :
//   /docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide et
//   /docs/apps/developer-platform/build-apps/authentication/oauth/working-with-oauth (autorisation :
//     GET https://app.hubspot.com/oauth/authorize avec client_id, redirect_uri, scope séparé par des
//     espaces, optional_scope, state ; jeton : POST https://api.hubapi.com/oauth/v3/token en formulaire,
//     client_id et client_secret dans le corps ; « You must be a Super Admin to install an app »)
//   /docs/api-reference/legacy/authentication/manage-oauth-tokens (API v3 : grant_type=authorization_code
//     avec code et redirect_uri, grant_type=refresh_token avec refresh_token seulement ; réponse
//     token_type, access_token, refresh_token, expires_in = 1800 s, hub_id, scopes ; erreurs conformes
//     à la RFC 6749, avec status « BAD_REFRESH_TOKEN » et message en plus pour un jeton révoqué)
//   /blog/oauth-token-management-hubspot-integrations (le jeton de rafraîchissement n'expire pas tant
//     que l'appli reste installée ; le renouvellement « potentially » rend un nouveau jeton, à garder ;
//     les adresses v1 sont dépréciées, la doc recommande la v3)
//   /docs/apps/legacy-apps/authentication/scopes (chaque droit ci-dessous : « Any account », donc aucun
//     optional_scope) et les pages des points d'accès lus (« This API requires one of the following
//     scopes » : crm.objects.contacts.read pour la recherche des notes, appels et réunions, ce même droit
//     ou sales-email-read pour les e-mails, crm.objects.owners.read, crm.objects.companies.read ; les
//     liens passent par le droit de chaque genre de fiche ; account-info demande « oauth »)
//   /changelog/legacy-public-app-creation-sunset (23/04/2026)
//
// Écarts au plan, d'après la doc :
// - « Appli publique non listée » : depuis le 26/05/2026 (23/06/2026 pour les comptes plus anciens),
//   HubSpot ne laisse plus créer d'appli publique « héritée » ; une nouvelle appli se crée avec la
//   plateforme à projets (`hs project`, `app-hsmeta.json` : auth.type « oauth », distribution
//   « marketplace » ou « private », droits requis). Le guide des applis (T62) doit le dire. Les adresses
//   et les droits ci-dessous sont les mêmes.
// - Le plan ne donne pas les droits : ce sont ceux de l'accès par clé (catalog.ts), plus « oauth »,
//   que la doc place dans son exemple d'adresse d'autorisation. Tous sont des droits de lecture. Les
//   droits cochés dans l'appli sont obligatoires et doivent tous figurer dans l'adresse : l'appli doit
//   déclarer exactement cette liste.
// - `sales-email-read` n'est pas indispensable d'après la doc (la recherche des e-mails accepte aussi
//   crm.objects.contacts.read) ; on le garde, comme pour la clé, car c'est le droit qui nomme la lecture
//   des e-mails, et un refus au milieu d'un passage mettrait toute la connexion en erreur.
// - Adresse de jeton : la page de référence donne https://api.hubspot.com/oauth/v3/token, le guide
//   d'autorisation https://api.hubapi.com/oauth/v3/token ; on prend la seconde, qui est l'hôte déjà
//   appelé par le connecteur.
// - Pas de PKCE : la doc de HubSpot n'en parle pas pour une appli publique (un message de forum parle
//   d'un PKCE exigé depuis peu, sans source de HubSpot ; il est exigé pour le serveur MCP de HubSpot,
//   pas pour ce flux).
//
// Un jeton d'accès de 30 minutes, renouvelé par le socle avant chaque passage. Le renouvellement n'envoie
// pas d'adresse de retour (la doc de la v3 ne la liste pas pour ce cas ; son guide d'autorisation l'indique).
//
// Non vérifié (aucune appli réelle) : que le renouvellement sans adresse de retour soit accepté ; que
// l'autorisation ne demande pas PKCE ; la forme exacte de l'erreur d'un utilisateur qui refuse (la doc dit
// seulement « If the user doesn't grant access, no request will be sent », et ailleurs que l'adresse de
// retour reçoit `error` et `error_description`) ; si un nouveau jeton de rafraîchissement est rendu à
// chaque renouvellement (le socle prend le nouveau s'il existe, et garde l'ancien sinon).
export const hubspotOAuth: OAuthSpec = {
  appKey: 'HUBSPOT',
  authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
  tokenUrl: 'https://api.hubapi.com/oauth/v3/token',
  scopes: [
    'oauth',
    'crm.objects.contacts.read',
    'crm.objects.companies.read',
    'crm.objects.deals.read',
    'crm.objects.owners.read',
    'sales-email-read',
  ],
  pkce: false,
  clientAuth: 'body',
  preFields: [],
  setupHosts: [],
  // La réponse de jeton porte aussi hub_id et scopes : le numéro du compte se relit à la vérification
  // (GET /account-info), et les droits sont ceux de l'appli. Rien d'autre à retenir que les jetons.
  toConfig: async () => ({}),
};
