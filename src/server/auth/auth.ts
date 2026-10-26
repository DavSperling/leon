import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { jwt } from 'better-auth/plugins';
import { organization } from 'better-auth/plugins/organization';
import { API_PATHS } from '@/capture/api-contract';
import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { firstOrganizationId } from './tenant-context';

export const MCP_RESOURCE = new URL(API_PATHS.mcp, env.BETTER_AUTH_URL).toString();

export const auth = betterAuth({
  appName: 'Leon',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 8 },
  // La connexion et l'inscription passent par les server actions (auth.api.*), sous la limite de débit de
  // rate-limit.ts : les routes HTTP de Better Auth la contourneraient (et l'inscription y créerait un compte sans
  // organisation). Seul le routeur les ferme : auth.api.* les appelle toujours.
  disabledPaths: ['/sign-in/email', '/sign-up/email'],
  advanced: {
    database: { generateId: 'uuid' },
    // L'adresse du client ne vient que de l'en-tête que pose le proxy de confiance (rate-limit.ts) ; sans lui,
    // aucune n'est lue : un en-tête choisi par le client ne vaut rien.
    ipAddress: env.LEON_IP_HEADER
      ? { ipAddressHeaders: [env.LEON_IP_HEADER] }
      : { disableIpTracking: true },
  },
  telemetry: { enabled: false },
  databaseHooks: {
    session: {
      create: {
        // La session porte l'organisation de l'utilisateur dès sa création.
        before: async (session) => ({
          data: { ...session, activeOrganizationId: await firstOrganizationId(session.userId) },
        }),
      },
    },
  },
  plugins: [
    // Rien n'est effacé : la suppression d'une organisation emporterait toute sa mémoire en cascade.
    // Une invitation ne s'accepte qu'avec un e-mail vérifié : sinon, quiconque s'inscrit avec
    // l'adresse invitée rejoint l'organisation (aucun e-mail n'est vérifié dans ce jet).
    organization({ disableOrganizationDeletion: true, requireEmailVerificationOnInvitation: true }),
    jwt(),
    mcp({
      resource: MCP_RESOURCE,
      loginPage: '/connexion',
      consentPage: '/mcp/autorisation',
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: 'infer',
      postLogin: {
        page: '/mcp/autorisation',
        shouldRedirect: async () => false,
        consentReferenceId: ({ session }) =>
          typeof session.activeOrganizationId === 'string'
            ? session.activeOrganizationId
            : undefined,
      },
      customAccessTokenClaims: ({ referenceId }) => (referenceId ? { tenantId: referenceId } : {}),
      scopes: ['openid', 'profile', 'email', 'offline_access', 'mcp:access'],
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: 'mcp-2026-07-28',
    }),
    nextCookies(), // en dernier : cookies posés par les server actions
  ],
});
