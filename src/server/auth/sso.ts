import { randomBytes } from 'node:crypto';
import {
  computeDiscoveryUrl,
  fetchDiscoveryDocument,
  normalizeDiscoveryUrls,
  selectTokenEndpointAuthMethod,
  validateDiscoveryDocument,
} from '@better-auth/sso';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { ssoProviders } from '@/server/db/schema/auth';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { auth, SSO_DNS_PREFIX } from './auth';
import { canInvite } from './members';
import { requestHeaders } from './session';
import type { TenantContext } from './tenant-context';

// Le SSO d'entreprise d'un espace : un seul fournisseur (OIDC ou SAML) par espace, réglé par son propriétaire ou un
// administrateur. Les routes HTTP du plugin sont fermées (auth.ts) : tout passe ici, sous canInvite et avec
// l'organisation de la session, jamais une organisation choisie par le navigateur.

const API = '/api/auth';
// « acme.com » : des lettres, chiffres et tirets, au moins un point ; ni schéma, ni chemin, ni arobase.
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const SsoInputSchema = z.discriminatedUnion('protocol', [
  z.object({
    protocol: z.literal('oidc'),
    domain: z.string().trim().toLowerCase().regex(DOMAIN),
    issuer: z.url({ protocol: /^https$/ }),
    clientId: z.string().trim().min(1).max(500),
    clientSecret: z.string().trim().min(1).max(2000),
  }),
  z.object({
    protocol: z.literal('saml'),
    domain: z.string().trim().toLowerCase().regex(DOMAIN),
    entryPoint: z.url({ protocol: /^https$/ }),
    metadata: z.string().trim().min(1).max(100_000),
  }),
]);
export type SsoInput = z.infer<typeof SsoInputSchema>;

export type SsoSetup = {
  providerId: string;
  protocol: 'oidc' | 'saml';
  domain: string;
  verified: boolean;
  // L'enregistrement TXT à poser chez l'hébergeur du domaine ; null une fois le domaine vérifié.
  dns: { name: string; value: string } | null;
  // À recopier dans le fournisseur d'identité : l'adresse de retour (OIDC), ou l'ACS et l'identifiant de Leon (SAML).
  redirectUrl: string;
  entityId: string | null;
};

export type SsoError = 'refuse' | 'deja' | 'decouverte' | 'invalide';

async function providerOf(ctx: TenantContext) {
  const [row] = await db
    .select()
    .from(ssoProviders)
    .where(eq(ssoProviders.organizationId, ctx.tenantId))
    .limit(1);
  return row ?? null;
}

const spEntityId = (providerId: string) =>
  `${env.BETTER_AUTH_URL}${API}/sso/saml2/sp/metadata?providerId=${providerId}`;

// Le réglage de l'espace pour l'écran des réglages ; null sans fournisseur, ou si le lecteur n'est pas administrateur.
export async function readSsoSetup(ctx: TenantContext): Promise<SsoSetup | null> {
  if (!(await canInvite(ctx))) return null;
  const row = await providerOf(ctx);
  if (!row) return null;
  const verified = row.domainVerified === true;
  let dns: SsoSetup['dns'] = null;
  if (!verified) {
    // Rend le jeton encore valide, ou en crée un (7 jours) : la page le montre tant que le domaine n'est pas prouvé.
    const { domainVerificationToken } = await auth.api.requestDomainVerification({
      body: { providerId: row.providerId },
      headers: await requestHeaders(),
    });
    const name = `_${SSO_DNS_PREFIX}-${row.providerId}`;
    dns = { name: `${name}.${row.domain}`, value: `${name}=${domainVerificationToken}` };
  }
  const saml = row.samlConfig !== null;
  return {
    providerId: row.providerId,
    protocol: saml ? 'saml' : 'oidc',
    domain: row.domain,
    verified,
    dns,
    redirectUrl: saml
      ? `${env.BETTER_AUTH_URL}${API}/sso/saml2/sp/acs/${row.providerId}`
      : `${env.BETTER_AUTH_URL}${API}/sso/callback/${row.providerId}`,
    entityId: saml ? spEntityId(row.providerId) : null,
  };
}

// La configuration OIDC lue chez le fournisseur. Le plugin ne la lit lui-même que pour une origine de confiance
// (trustedOrigins) : y mettre chaque fournisseur ouvrirait l'API de Leon à son origine. On la lit donc ici, par les
// fonctions du plugin, qui refusent les adresses internes et les redirections.
async function discoverOidc(issuer: string) {
  const document = await fetchDiscoveryDocument(computeDiscoveryUrl(issuer));
  validateDiscoveryDocument(document, issuer);
  // https seulement ; les adresses internes sont refusées plus loin (registerSSOProvider, puis à chaque appel). Une
  // adresse sur un autre hôte que l'émetteur est permise : Google sert ses jetons depuis oauth2.googleapis.com.
  const urls = normalizeDiscoveryUrls(document, issuer, (url) => url.startsWith('https://'));
  return {
    authorizationEndpoint: urls.authorization_endpoint,
    tokenEndpoint: urls.token_endpoint,
    jwksEndpoint: urls.jwks_uri,
    userInfoEndpoint: urls.userinfo_endpoint,
    tokenEndpointAuthentication: selectTokenEndpointAuthMethod(urls),
  };
}

export async function registerSso(
  ctx: TenantContext,
  input: SsoInput,
): Promise<{ ok: true } | { ok: false; error: SsoError }> {
  if (!(await canInvite(ctx))) return { ok: false, error: 'refuse' };
  if (await providerOf(ctx)) return { ok: false, error: 'deja' };
  // 12 caractères : le nom DNS « _leon-verification-sso-… » tient dans les 63 d'une étiquette.
  const providerId = `sso-${randomBytes(6).toString('hex')}`;
  const common = { providerId, domain: input.domain, organizationId: ctx.tenantId };
  let body: Record<string, unknown>;
  if (input.protocol === 'oidc') {
    let endpoints: Awaited<ReturnType<typeof discoverOidc>>;
    try {
      endpoints = await discoverOidc(input.issuer);
    } catch (error) {
      logError('auth.sso.discovery', error);
      return { ok: false, error: 'decouverte' };
    }
    body = {
      ...common,
      issuer: input.issuer,
      oidcConfig: {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        skipDiscovery: true,
        ...endpoints,
      },
    };
  } else {
    body = {
      ...common,
      issuer: spEntityId(providerId),
      samlConfig: {
        entryPoint: input.entryPoint,
        idpMetadata: { metadata: input.metadata },
        wantAssertionsSigned: true,
      },
    };
  }
  try {
    await auth.api.registerSSOProvider({ body, headers: await requestHeaders() });
    return { ok: true };
  } catch (error) {
    logError('auth.sso.register', error);
    return { ok: false, error: 'invalide' };
  }
}

// Cherche l'enregistrement TXT du domaine ; vrai s'il est trouvé (le domaine est alors vérifié pour de bon).
export async function verifySsoDomain(ctx: TenantContext): Promise<boolean> {
  if (!(await canInvite(ctx))) return false;
  const row = await providerOf(ctx);
  if (!row) return false;
  if (row.domainVerified) return true;
  try {
    await auth.api.verifyDomain({
      body: { providerId: row.providerId },
      headers: await requestHeaders(),
    });
    return true;
  } catch {
    return false; // pas encore visible dans le DNS : l'écran le dit
  }
}

// Retire le SSO de l'espace : les comptes restent, ils se connectent autrement (mot de passe, Google, Microsoft).
export async function removeSso(ctx: TenantContext): Promise<boolean> {
  if (!(await canInvite(ctx))) return false;
  const row = await providerOf(ctx);
  if (!row) return true;
  await auth.api.deleteSSOProvider({
    body: { providerId: row.providerId },
    headers: await requestHeaders(),
  });
  return true;
}

// L'écran de connexion ne propose « SSO d'entreprise » que si au moins un espace l'a réglé et prouvé.
export async function anyVerifiedSso(): Promise<boolean> {
  const rows = await db
    .select({ id: ssoProviders.id })
    .from(ssoProviders)
    .where(eq(ssoProviders.domainVerified, true))
    .limit(1);
  return rows.length > 0;
}
