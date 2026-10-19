import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, ViewerProfileSchema } from '@/capture/api-contract';
import { IngestResultSchema } from '@/capture/turn';
import { createApiToken } from '@/server/auth/api-tokens';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestTenant } from '@/test/fixtures';
import { productionSources } from './files';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

// Chaque chemin de API_PATHS est soit servi (il répond 401 sans jeton), soit déclaré « pas encore servi »
// (il répond 404) : un chemin ajouté au contrat sans route, ou une route servie sans que la liste suive, fait échouer ces tests.
const SERVED = {
  ingest: ['POST', { body: {} }],
  me: ['GET', {}],
  mcp: ['POST', { body: initialize }],
} as const;
// T13 sert la route du point du matin : elle passe alors dans SERVED (la forme de réponse, BriefingResponseSchema,
// est déjà celle de C8) et ajoute son cas « 200 conforme au schéma » plus bas.
const NOT_YET_SERVED: Array<keyof typeof API_PATHS> = ['briefing'];

describe('routes de l’API', () => {
  it('chaque chemin de API_PATHS est servi ou déclaré pas encore servi', () => {
    expect([...Object.keys(SERVED), ...NOT_YET_SERVED].sort()).toEqual(
      Object.keys(API_PATHS).sort(),
    );
  });

  it.each(Object.entries(SERVED))('%s répond 401 sans jeton', async (name, [method, init]) => {
    const response = await apiRequest(API_PATHS[name as keyof typeof SERVED], { method, ...init });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it.each(NOT_YET_SERVED)(
    '%s répond 404 : sa route n’existe pas encore (si T13 la sert, la retirer de NOT_YET_SERVED)',
    async (name) => {
      expect((await apiRequest(API_PATHS[name])).status).toBe(404);
    },
  );

  it('GET /api/health répond 200', async () => {
    const response = await apiRequest('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('GET /api/auth/ok répond 200 : Better Auth est monté', async () => {
    expect((await apiRequest('/api/auth/ok')).status).toBe(200);
  });

  it('renvoie des réponses conformes aux schémas que la CLI et l’extension valident', async () => {
    const {
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    const { token } = await createApiToken(paul, 'test');
    const body = {
      source: { kind: 'claude_ai', external_id: `conv-${crypto.randomUUID()}` },
      turns: [
        {
          external_id: 'msg-1',
          role: 'user',
          text: 'Bonjour',
          ts: '2026-10-13T09:00:00+02:00',
          capture_mode: 'network',
        },
      ],
    };

    const me = await apiRequest(API_PATHS.me, { token });
    const ingest = await apiRequest(API_PATHS.ingest, { token, body });

    expect([me.status, ingest.status]).toEqual([200, 202]);
    expect(ViewerProfileSchema.parse(await me.json()).userId).toBe(paul.userId);
    expect(IngestResultSchema.parse(await ingest.json()).inserted).toBe(1);
  });
});

describe('clients de l’API', () => {
  it('ne contiennent aucune chaîne /api/ en dur : ils passent par API_PATHS', () => {
    const offenders = productionSources(
      'src/cli/**/*.ts',
      'src/capture/**/*.ts',
      'extension/**/*.ts',
    )
      .filter(({ path }) => path !== 'src/capture/api-contract.ts')
      .filter(({ text }) => /['"`][^'"`\n]*\/api\//.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
