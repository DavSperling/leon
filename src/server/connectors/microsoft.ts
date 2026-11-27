import type { ProviderId } from '@/capture/turn';
import { adminConsentState } from '@/lib/connection-form';
import type { OAuthSpec } from './types';

// L'appli Microsoft de Leon (Entra ID, « Leon »), une seule pour Outlook, OneDrive et Teams, comme l'appli Google
// pour Gmail et Drive : LEON_OAUTH_MICROSOFT_*. Inscrite pour « tout annuaire Entra ID et comptes Microsoft
// personnels ». Tous les droits sont demandés d'avance (choix de David du 27/11/2026, comme pour Google), pour ne
// pas refaire autoriser le jour où Leon agira ; aujourd'hui il ne fait que lire. L'inscription déclare les droits
// de tous les outils (docs/guides/applis-oauth.md) ; chaque outil ne demande que les siens.
//
// Doc lue le 27/11/2026 :
//   https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow (lue le 15/10/2026 :
//     /{locataire}/oauth2/v2.0/authorize et /token ; « common » : comptes professionnels et personnels,
//     « organizations » : professionnels seulement ; PKCE recommandé ; jeton de rafraîchissement rendu avec
//     offline_access, remplacé à chaque renouvellement ; prompt=select_account fait choisir le compte).
//   https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent : /{locataire}/v2.0/adminconsent,
//     « organizations » admis, jamais « common » (« personal accounts cannot provide admin consent ») ; `scope`
//     « static (/.default) or dynamic scopes » : l'administrateur accepte exactement les droits demandés, ceux de
//     l'outil et non tous ceux de l'appli ; `state` rendu au retour (admin_consent=True&tenant=…, ou error=…).
//   https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies : le réglage par
//     défaut d'un nouvel annuaire (« Let Microsoft manage your consent settings ») interdit à l'employé seul
//     Mail.*, Calendars.*, Files.Read(Write).All, Sites.*, Chat.*, MailboxSettings.*, OnlineMeetings.* :
//     l'administrateur du client accepte une fois pour toute l'entreprise.
//   https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-risk-based-step-up-consent : une
//     appli multi-annuaire récente sans éditeur vérifié (publisher verification, Partner Center) qui demande plus
//     que le profil passe aussi par l'administrateur.
//   https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes (AADSTS90094 et 90095 :
//     accord de l'administrateur requis ; AADSTS65001 : aucun accord ; AADSTS65004 : l'utilisateur a refusé).
//
// Jamais `prompt=consent` : un retour de la communauté Microsoft dit qu'il bloque les utilisateurs ordinaires même
// après l'accord de l'administrateur (non confirmé par la doc officielle). `scope` est envoyé aussi à l'échange et
// au renouvellement (obligatoire d'après la doc de Graph, facultatif d'après celle d'Entra).
//
// Non vérifié, sans appel réel : que l'adresse d'accord accepte offline_access avec les droits de Graph en
// adresses complètes ; l'écran exact de l'employé dont l'entreprise exige l'accord (page de Microsoft sans retour
// vers Leon, d'où le lien d'accord montré aussi avant le bouton).

const LOGIN = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/';

// AADSTS suivi d'un code qui ne continue pas : AADSTS650011 n'est pas AADSTS65001.
const ADMIN_CONSENT_CODES = /AADSTS(?:90094|90095|65001)(?!\d)/;

// « common » : comptes professionnels et comptes personnels (outlook.com, hotmail.fr) ; « organizations » :
// professionnels seulement (Teams n'existe pas pour un compte personnel).
export type MicrosoftAudience = 'common' | 'organizations';

// `graphScopes` : les droits délégués de Graph de l'outil, en noms courts (« Mail.ReadWrite »).
export function microsoftOAuth(
  tool: ProviderId,
  audience: MicrosoftAudience,
  graphScopes: string[],
): OAuthSpec {
  const graph = ['User.Read', ...graphScopes];
  const scopes = ['offline_access', ...graph];
  const scope = scopes.join(' ');
  return {
    appKey: 'MICROSOFT',
    authorizeUrl: `${LOGIN}/${audience}/oauth2/v2.0/authorize`,
    tokenUrl: `${LOGIN}/${audience}/oauth2/v2.0/token`,
    scopes,
    pkce: true,
    clientAuth: 'body',
    extraAuthorizeParams: { response_mode: 'query', prompt: 'select_account' },
    extraTokenParams: { code: { scope }, refresh: { scope } },
    preFields: [],
    setupHosts: [],

    // L'administrateur Microsoft de l'entreprise accepte une fois les droits de l'outil, pour toute l'entreprise.
    adminConsent: {
      isConsentError: ({ error, description }) =>
        error === 'consent_required' || ADMIN_CONSENT_CODES.test(description ?? ''),
      url: (clientId, redirectUri, returnTo) =>
        `${LOGIN}/organizations/v2.0/adminconsent?${new URLSearchParams({
          client_id: clientId,
          scope: ['offline_access', ...graph.map((name) => GRAPH + name)].join(' '),
          redirect_uri: redirectUri,
          state: adminConsentState(tool, returnTo),
        }).toString()}`,
    },

    // Rien de plus à retenir que les jetons : `verify` lit le compte.
    toConfig: async () => ({}),
  };
}
