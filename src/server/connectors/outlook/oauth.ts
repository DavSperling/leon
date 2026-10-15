import type { OAuthSpec } from '../types';

// Le bouton « Se connecter avec Outlook » : Microsoft Graph, comptes professionnels ou scolaires
// seulement (locataire « organizations »). Doc lue le 15/10/2026 :
//   https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
//     adresse d'autorisation https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize,
//     adresse de jeton .../organizations/oauth2/v2.0/token ; formulaire, client_id et client_secret
//     avec les paramètres (le Basic est accepté aussi) ; PKCE « recommandé pour tous les types
//     d'appli » (S256 ou plain) ; response_mode=query par défaut pour un code ; jeton d'accès d'environ
//     1 h (expires_in 3599 à 3736) ; jeton de rafraîchissement sans durée fixe, remplacé à chaque
//     renouvellement (« jetez l'ancien ») et rendu seulement avec offline_access.
//   https://learn.microsoft.com/en-us/graph/auth-v2-user (droits Graph : noms courts, Mail.Read ;
//     scope « obligatoire » à l'échange et facultatif au renouvellement).
//   https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent (adresse
//     https://login.microsoftonline.com/{locataire}/v2.0/adminconsent, « organizations » admis,
//     « common » à éviter ; retour : admin_consent=True&tenant=…, ou error=…&admin_consent=True).
//   https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes
//     (AADSTS90094 : accord de l'administrateur requis ; AADSTS90095 : même chose avec le circuit
//     de demande d'accord ; AADSTS65001 : ni l'utilisateur ni l'administrateur n'ont donné leur
//     accord ; AADSTS65004 : l'utilisateur a refusé, ce n'est pas un défaut d'accord).
//
// Écarts au plan, d'après la doc :
//   - `scope` est envoyé aussi à l'échange du code (le plan ne le prévoyait qu'au renouvellement) : la
//     doc de Graph le dit obligatoire, celle d'Entra facultatif ; le même texte aux deux endroits ne
//     coûte rien, et au renouvellement il garantit un nouveau jeton de rafraîchissement.
//   - `response_mode=query` est écrit en toutes lettres : la doc le recommande (c'est le défaut).
//   - Jamais `prompt=consent` : un retour de la communauté Microsoft dit qu'il bloque les utilisateurs
//     ordinaires même après l'accord de l'administrateur (non confirmé par la doc officielle).
//   - `toConfig` ne lit pas /v1.0/me : `verify` le fait pour le nom du compte, et rien d'autre n'est
//     à retenir (`setupHosts` vide).
//
// Non vérifié, sans appel réel : que Microsoft rende toujours `refresh_token` au renouvellement ;
// l'écran exact que voit un utilisateur dont l'entreprise exige l'accord de l'administrateur (page
// de Microsoft sans retour vers Leon, AADSTS90094 : le lien d'accord est donc aussi montré avant le
// bouton) ; que l'adresse d'accord accepte « /.default » avec les seuls droits déclarés dans
// l'inscription de l'appli (ceux de SCOPES, en « Autorisations déléguées »).

const SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read'];

// AADSTS suivi d'un code qui ne continue pas : AADSTS650011 n'est pas AADSTS65001.
const ADMIN_CONSENT_CODES = /AADSTS(?:90094|90095|65001)(?!\d)/;

export const outlookOAuth: OAuthSpec = {
  appKey: 'OUTLOOK',
  authorizeUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
  scopes: SCOPES,
  pkce: true,
  clientAuth: 'body',
  extraAuthorizeParams: { response_mode: 'query' },
  extraTokenParams: {
    code: { scope: SCOPES.join(' ') },
    refresh: { scope: SCOPES.join(' ') },
  },
  preFields: [],
  setupHosts: [],

  // L'administrateur Microsoft de l'entreprise doit donner son accord une fois pour toute l'entreprise.
  adminConsent: {
    isConsentError: ({ error, description }) =>
      error === 'consent_required' || ADMIN_CONSENT_CODES.test(description ?? ''),
    url: (clientId, redirectUri) =>
      `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        redirect_uri: redirectUri,
      }).toString()}`,
  },

  // Outlook n'a rien de plus à retenir que les jetons.
  toConfig: async () => ({}),
};
