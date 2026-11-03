import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  BriefingResponseSchema,
  ContextResponseSchema,
  SessionFactsPayloadSchema,
  ViewerProfileSchema,
} from '@/capture/api-contract';
import { extractClaudeCodeFacts } from '@/capture/session-facts';
import { IngestResultSchema } from '@/capture/turn';
import { createApiToken } from '@/server/auth/api-tokens';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestTenant } from '@/test/fixtures';
import { productionSources } from './files';

vi.mock('@/server/pipeline/queue');
// Le point du matin met en file un recalcul quand rien n'est prêt : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

// Chaque chemin de API_PATHS est soit servi (il répond 401 sans jeton), soit déclaré « pas encore servi »
// (il répond 404) : un chemin ajouté au contrat sans route, ou une route servie sans que la liste suive, fait échouer ces tests.
const SERVED = {
  ingest: ['POST', { body: {} }],
  me: ['GET', {}],
  mcp: ['POST', { body: initialize }],
  briefing: ['GET', {}],
  faits: ['POST', { body: {} }],
  contexte: ['POST', { body: {} }],
  ordinateurs: ['POST', { body: {} }], // sans jeton : 401 avant de lire le corps
  jeton: ['DELETE', {}],
} as const;
// Aucun chemin en attente depuis T13 (le point du matin) : un chemin ajouté au contrat avant sa route vient ici.
const NOT_YET_SERVED: Array<keyof typeof API_PATHS> = [];

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

  it.skipIf(NOT_YET_SERVED.length === 0).each(NOT_YET_SERVED)(
    '%s répond 404 : sa route n’existe pas encore (une fois servie, la retirer de NOT_YET_SERVED)',
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

  // Audit 2 n° 3 : la connexion, l'inscription, le changement de mot de passe et la 2FA ne passent que par les
  // server actions, sous la limite de débit de rate-limit.ts ; les routes HTTP de Better Auth la contourneraient.
  it.each([
    '/api/auth/sign-in/email',
    '/api/auth/sign-up/email',
    '/api/auth/change-password',
    '/api/auth/two-factor/enable',
    '/api/auth/two-factor/disable',
    '/api/auth/two-factor/generate-backup-codes',
    '/api/auth/two-factor/verify-totp',
  ])(
    'POST %s répond 404 : seules les pages de Leon vérifient un mot de passe ou un code',
    async (path) => {
      const body = { email: 'paul@example.com', password: 'motdepasse-solide', name: 'Paul' };
      expect((await apiRequest(path, { body })).status).toBe(404);
    },
  );

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
    const briefing = await apiRequest(
      `${API_PATHS.briefing}?${new URLSearchParams({ [BRIEFING_PROJECT_PARAM]: 'github.com/acme/leon' })}`,
      { token },
    );
    const faits = await apiRequest(API_PATHS.faits, {
      token,
      body: SessionFactsPayloadSchema.parse({
        kind: 'claude_code',
        external_id: `session-${crypto.randomUUID()}`,
        accord: 2,
        faits: extractClaudeCodeFacts('', '/'),
        fin: false,
      }),
    });
    const contexte = await apiRequest(API_PATHS.contexte, {
      token,
      body: { projet: 'github.com/acme/leon', branche: null, session: 'session-courante' },
    });

    expect([me.status, ingest.status, briefing.status, faits.status, contexte.status]).toEqual([
      200, 202, 200, 202, 200,
    ]);
    expect(ViewerProfileSchema.parse(await me.json()).userId).toBe(paul.userId);
    expect(IngestResultSchema.parse(await ingest.json()).inserted).toBe(1);
    expect(BriefingResponseSchema.parse(await briefing.json()).projet).toBeNull();
    expect(ContextResponseSchema.parse(await contexte.json()).texte).not.toBe('');
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
