import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from './http';
import { PipedreamConfigSchema } from './pipedream';
import type { OAuthSpec } from './types';

// Gmail et Google Drive par l'appli Google de Leon : projet Google Cloud « Leon connecteurs » (compte d'Amos),
// publiée sans vérification, donc 100 utilisateurs au plus sur toute la vie du projet et un écran « appli non
// validée » à passer (Paramètres avancés › Accéder à Leon). Sans LEON_OAUTH_GOOGLE_*, le bouton passe encore par
// Pipedream ; une connexion branchée par Pipedream y reste jusqu'à son « Reconnecter ».
//
// Doc lue le 26/11/2026 : https://developers.google.com/identity/protocols/oauth2/web-server
//   adresse https://accounts.google.com/o/oauth2/v2/auth, droits séparés par des espaces ; access_type=offline
//   pour un jeton de rafraîchissement, rendu seulement au premier accord, d'où prompt=consent (« to ensure a new
//   refresh token is issued ») ; select_account pour choisir le compte à chaque fois ; jeton à
//   https://oauth2.googleapis.com/token, jeton d'accès en « Bearer ». Pas d'include_granted_scopes : chaque
//   connexion garde un jeton limité à son propre droit. PKCE : absent de cette page, mais Better Auth l'exige pour
//   son bouton Google (social-providers/google.mjs). Un droit décoché par l'utilisateur fait échouer `verify`
//   (403), et le retour dit « refusé ».

export const googleOAuth = (scope: string): OAuthSpec => ({
  appKey: 'GOOGLE',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [scope],
  pkce: true,
  clientAuth: 'body',
  extraAuthorizeParams: { access_type: 'offline', prompt: 'consent select_account' },
  preFields: [],
  setupHosts: [],
  toConfig: async () => ({}),
});

const { externalUserId, accountId } = PipedreamConfigSchema.shape;

// Branchée par Pipedream (son proxy porte l'accès) ou par notre appli (les jetons).
export const GoogleConfigSchema = z
  .object({
    authMode: z.enum(['pipedream', 'oauth']),
    externalUserId: externalUserId.optional(),
    accountId: accountId.optional(),
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const required =
      config.authMode === 'oauth'
        ? (['accessToken'] as const)
        : (['externalUserId', 'accountId'] as const);
    for (const field of required)
      if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
  });
export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;

// Par notre appli, chaque requête porte le jeton ; par Pipedream, son proxy l'ajoute.
export function googleHttp(config: GoogleConfig, http: ConnectorHttp): ConnectorHttp {
  if (config.authMode !== 'oauth') return http;
  const signed = (request: HttpRequest): HttpRequest => ({
    ...request,
    headers: { ...request.headers, authorization: `Bearer ${config.accessToken ?? ''}` },
  });
  return {
    json: (request, schema) => http.json(signed(request), schema),
    page: (request, schema) => http.page(signed(request), schema),
    text: (request) => http.text(signed(request)),
    bytes: (request) => http.bytes(signed(request)),
  };
}
