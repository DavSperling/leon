import { describe, expect, it, vi } from 'vitest';
import { GET as serverMetadata } from '@/app/.well-known/oauth-authorization-server/route';
import { GET as mcpResourceMetadata } from '@/app/.well-known/oauth-protected-resource/api/mcp/route';
import { GET as resourceMetadata } from '@/app/.well-known/oauth-protected-resource/route';
import { API_PATHS } from '@/capture/api-contract';
import { env } from '@/server/env';
import { pathExists } from '@/test/contracts/files';
import {
  AUTHORIZE_PATH,
  ISSUER,
  MCP_CHALLENGE,
  RESOURCE,
  RESOURCE_METADATA_PATH,
  SERVER_METADATA_PATH,
} from './metadata';

// Une barre finale, comme on la tape dans .env : l'émetteur et la ressource doivent s'en passer.
vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'https://leon.example/' } }));

const BASE = 'https://leon.example';

// L1, L2 et L3 du plan « MCP distant », recopiés tels quels : un client OAuth les lit à la lettre.
const L1 = {
  resource: `${BASE}/api/mcp`,
  authorization_servers: [BASE],
  scopes_supported: ['leon'],
  bearer_methods_supported: ['header'],
  resource_name: 'Leon',
};
const L2 = `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp", scope="leon"`;
const L3 = {
  issuer: BASE,
  authorization_endpoint: `${BASE}/oauth/autoriser`,
  token_endpoint: `${BASE}/api/oauth/jeton`,
  registration_endpoint: `${BASE}/api/oauth/clients`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['leon'],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: true,
};

describe('métadonnées OAuth du MCP distant', () => {
  it.each([
    ['/.well-known/oauth-protected-resource/api/mcp', mcpResourceMetadata, L1],
    ['/.well-known/oauth-protected-resource', resourceMetadata, L1],
    ['/.well-known/oauth-authorization-server', serverMetadata, L3],
  ])('GET %s rend le document du plan, en JSON, gardé une heure', async (_path, GET, expected) => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await response.json()).toEqual(expected);
  });

  it('le 401 de /api/mcp annonce la ressource et le périmètre', () => {
    expect(MCP_CHALLENGE).toBe(L2);
  });

  it('toutes les adresses annoncées sont absolues, sous BETTER_AUTH_URL, et viennent des constantes de chemins', async () => {
    const resource = await resourceMetadata().json();
    const server = await serverMetadata().json();
    const challenge = /resource_metadata="([^"]+)"/.exec(MCP_CHALLENGE)?.[1];

    const announced = [
      resource.resource,
      ...resource.authorization_servers,
      server.issuer,
      server.authorization_endpoint,
      server.token_endpoint,
      server.registration_endpoint,
      challenge,
    ];
    for (const address of announced) {
      expect(URL.canParse(address)).toBe(true);
      expect(address === BASE || address.startsWith(`${BASE}/`)).toBe(true);
    }
    expect(env.BETTER_AUTH_URL).toBe(`${BASE}/`);
    expect(ISSUER).toBe(BASE);
    expect(RESOURCE).toBe(`${BASE}${API_PATHS.mcp}`);
    expect(resource.resource).toBe(RESOURCE);
    expect(server.authorization_endpoint).toBe(`${ISSUER}${AUTHORIZE_PATH}`);
    expect(server.token_endpoint).toBe(`${ISSUER}${API_PATHS.oauthJeton}`);
    expect(server.registration_endpoint).toBe(`${ISSUER}${API_PATHS.oauthClients}`);
    expect(challenge).toBe(`${ISSUER}${RESOURCE_METADATA_PATH}${API_PATHS.mcp}`);
  });

  // Le chemin d'un route.ts, c'est son dossier : si une constante bouge sans lui, le client reçoit un 404.
  it('les routes de découverte sont aux chemins que les constantes annoncent', () => {
    expect(pathExists(`src/app${RESOURCE_METADATA_PATH}/route.ts`)).toBe(true);
    expect(pathExists(`src/app${RESOURCE_METADATA_PATH}${API_PATHS.mcp}/route.ts`)).toBe(true);
    expect(pathExists(`src/app${SERVER_METADATA_PATH}/route.ts`)).toBe(true);
  });

  // authorization_endpoint est une page, dans le groupe de routes (auth) : son dossier est l'adresse annoncée. Les deux
  // autres adresses annoncées sont des routes de l'API, vérifiées par api-contract.db.test.ts (400 à un POST vide).
  it('authorization_endpoint est une page qui existe', async () => {
    const { pathname } = new URL((await serverMetadata().json()).authorization_endpoint);
    expect(pathname).toBe(AUTHORIZE_PATH);
    expect(pathExists(`src/app/(auth)${AUTHORIZE_PATH}/page.tsx`)).toBe(true);
  });
});
