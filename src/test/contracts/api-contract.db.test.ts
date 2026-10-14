import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, BriefingResponseSchema, ViewerProfileSchema } from '@/capture/api-contract';
import { IngestResultSchema } from '@/capture/turn';
import { createApiToken } from '@/server/auth/api-tokens';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestTenant } from '@/test/fixtures';
import { productionSources } from './files';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

describe('routes de l’API', () => {
  // Chaque chemin de API_PATHS avec la méthode de C7 : un chemin ou une méthode qui dérive donnerait 404 ou 405.
  it.each([
    ['POST', API_PATHS.ingest, { body: {} }],
    ['GET', API_PATHS.me, {}],
    ['GET', API_PATHS.briefing, {}],
    ['POST', API_PATHS.mcp, { body: initialize }],
  ] as const)('%s %s répond 401 sans jeton', async (method, path, init) => {
    const response = await apiRequest(path, { method, ...init });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

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
    const briefing = await apiRequest(API_PATHS.briefing, { token });
    const ingest = await apiRequest(API_PATHS.ingest, { token, body });

    expect([me.status, briefing.status, ingest.status]).toEqual([200, 200, 202]);
    expect(ViewerProfileSchema.parse(await me.json()).userId).toBe(paul.userId);
    expect(BriefingResponseSchema.parse(await briefing.json()).entries).toEqual([]);
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
