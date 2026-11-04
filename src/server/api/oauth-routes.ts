import { createHash, timingSafeEqual } from 'node:crypto';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ACCESS_TTL_MS, createGrant, refreshGrant } from '@/server/auth/api-tokens';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { readAuthorizationCode } from '@/server/oauth/authorize';
import { type ClientInfo, readClientId, registerClient } from '@/server/oauth/clients';
import { OAUTH_SCOPE, RESOURCE } from '@/server/oauth/metadata';

// Les routes publiques du serveur d'autorisation OAuth : ni jeton ni session, par nature (un client qui s'inscrit, ou
// qui présente le code qu'on vient de lui donner, n'a encore rien). L'inscription (RFC 7591) ne lit ni n'écrit rien en
// base ; la route des jetons (RFC 6749, L8 du plan « MCP distant ») crée la ligne de l'assistant.

const REGISTER_MAX_BYTES = 4 * 1024;
// Plus que L8 (4 Ko) : un client_id signé, au maximum légal (5 adresses de 512 caractères et un nom), fait environ 3,7 Ko
// à lui seul.
const TOKEN_MAX_BYTES = 8 * 1024;
const FORM = 'application/x-www-form-urlencoded';
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/; // RFC 7636 §4.1

type TokenError =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_target'
  | 'unsupported_grant_type';
type Tokens = { accessToken: string; refreshToken: string };

// RFC 6749 §5.1 : aucune réponse de la route des jetons ne se met en cache, erreurs comprises.
const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
};

// Le corps du formulaire, ou null : autre type (JSON compris), corps illisible, ou paramètre en double.
async function readForm(c: Context): Promise<Record<string, string> | null> {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== FORM) return null;
  const params = new URLSearchParams(await c.req.text().catch(() => ''));
  const names = [...params.keys()];
  return new Set(names).size === names.length ? Object.fromEntries(params) : null;
}

// Les paramètres en trop sont écartés. Les valeurs reçues ne sont jamais recopiées dans une erreur : elles portent un
// code, un code_verifier ou un jeton.
const Common = { client_id: z.string().min(1), resource: z.string().optional() };
const GrantSchema = z.discriminatedUnion('grant_type', [
  z.object({
    ...Common,
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1),
    code_verifier: z.string().min(1),
    redirect_uri: z.string().optional(), // la demande a pu l'omettre (une seule adresse inscrite) : M05 écrit alors l'implicite dans le code
  }),
  z.object({ ...Common, grant_type: z.literal('refresh_token'), refresh_token: z.string().min(1) }),
]);
const GRANT_TYPES = ['authorization_code', 'refresh_token'];

// RFC 7636 §4.6 : S256, comparé en temps constant. Les deux font 43 caractères (le schéma du code l'impose à `p`).
function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// null : tout ce qui ne va pas, sans dire quoi (code faux, expiré ou d'un autre client, adresse ou verifier qui ne
// correspondent pas, membre parti, code déjà servi).
async function exchangeCode(
  grant: { code: string; code_verifier: string; redirect_uri?: string },
  client: ClientInfo,
): Promise<Tokens | null> {
  const code = readAuthorizationCode(grant.code);
  if (
    !code ||
    code.c !== client.ref ||
    (grant.redirect_uri !== undefined && grant.redirect_uri !== code.r) ||
    !pkceMatches(grant.code_verifier, code.p)
  )
    return null;
  // L'adhésion de maintenant, pas celle du moment où l'utilisateur a cliqué.
  const ctx = await resolveTenantContext(code.u, code.t);
  if (!ctx) return null;
  return createGrant(ctx, {
    grantId: code.j,
    clientRef: client.ref,
    clientName: client.name,
    clientHost: client.host,
    name: client.name,
  });
}

async function grantTokens(form: Record<string, string>): Promise<Tokens | TokenError> {
  if (form.grant_type !== undefined && !GRANT_TYPES.includes(form.grant_type))
    return 'unsupported_grant_type';
  // Les paramètres d'abord : une requête mal formée ne coûte pas la lecture d'un client.
  const parsed = GrantSchema.safeParse(form);
  if (!parsed.success) return 'invalid_request';
  const grant = parsed.data;
  if (grant.resource !== undefined && grant.resource !== RESOURCE) return 'invalid_target';
  const client = await readClientId(grant.client_id);
  if (!client) return 'invalid_client';
  const tokens =
    grant.grant_type === 'refresh_token'
      ? await refreshGrant(grant.refresh_token, client.ref)
      : await exchangeCode(grant, client);
  return tokens ?? 'invalid_grant';
}

export const oauthRoutes = new Hono()
  .post(
    '/clients',
    bodyLimit({
      maxSize: REGISTER_MAX_BYTES,
      onError: (c) => c.json({ error: 'invalid_client_metadata' }, 400),
    }),
    async (c) => {
      // Un corps illisible vaut un corps vide : registerClient le refuse. Jamais les valeurs reçues dans la réponse.
      const result = registerClient(await c.req.json().catch(() => undefined));
      return 'error' in result ? c.json({ error: result.error }, 400) : c.json(result.client, 201);
    },
  )
  // Pas de limite par adresse IP (comme l'inscription) : les adresses d'Anthropic et d'OpenAI sont partagées par tous
  // leurs utilisateurs. Un client public : pas d'en-tête Authorization attendu.
  .post(
    '/jeton',
    noStore,
    bodyLimit({
      maxSize: TOKEN_MAX_BYTES,
      onError: (c) => c.json({ error: 'invalid_request' }, 400),
    }),
    async (c) => {
      const form = await readForm(c);
      const result = form ? await grantTokens(form) : 'invalid_request';
      if (typeof result === 'string') return c.json({ error: result }, 400);
      return c.json({
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_MS / 1000,
        refresh_token: result.refreshToken,
        scope: OAUTH_SCOPE,
      });
    },
  );
