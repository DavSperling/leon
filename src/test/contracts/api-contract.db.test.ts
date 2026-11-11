import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  BriefingResponseSchema,
  ComputerResponseSchema,
  ContextResponseSchema,
  ReadResponseSchema,
  RetraitRequestSchema,
  SessionFactsPayloadSchema,
  ViewerProfileSchema,
} from '@/capture/api-contract';
import { extractClaudeCodeFacts } from '@/capture/session-facts';
import { IngestResultSchema } from '@/capture/turn';
import { createApiToken, generateApiToken, hashApiToken } from '@/server/auth/api-tokens';
import { signComputerCode } from '@/server/auth/computer-code';
import { AUTHORIZATION_SERVER_METADATA } from '@/server/oauth/metadata';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestTenant } from '@/test/fixtures';
import { TEST_ENV } from '@/test/test-env';
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
  retrait: ['POST', { body: {} }],
  dossier: ['POST', { body: {} }],
  fil: ['POST', { body: {} }],
  chercher: ['POST', { body: {} }],
  versions: ['POST', { body: {} }],
  lecons: ['POST', { body: {} }],
  rappel: ['POST', { body: {} }],
  noter: ['POST', { body: {} }],
} as const;
// Publiques par nature (L4, L8) : l'inscription d'un client OAuth et l'échange du code contre les jetons se font sans
// jeton ni session. Leur sonde est un POST sans corps valide, qui répond 400 : la route existe (ni 404) et ne demande
// rien (ni 401).
const PUBLIC = ['oauthClients', 'oauthJeton'] as const;
// Un chemin ajouté au contrat avant sa route vient ici (les métadonnées du serveur d'autorisation peuvent l'annoncer
// avant qu'il soit servi).
const NOT_YET_SERVED: Array<keyof typeof API_PATHS> = [];

// Seule /api/mcp dit au client où trouver le serveur d'autorisation (L2) ; les autres routes à jeton gardent le défi nu.
const MCP_CHALLENGE = `Bearer resource_metadata="${TEST_ENV.BETTER_AUTH_URL}/.well-known/oauth-protected-resource/api/mcp", scope="leon"`;

describe('routes de l’API', () => {
  it('chaque chemin de API_PATHS est servi, public ou déclaré pas encore servi', () => {
    expect([...Object.keys(SERVED), ...PUBLIC, ...NOT_YET_SERVED].sort()).toEqual(
      Object.keys(API_PATHS).sort(),
    );
  });

  it.each(Object.entries(SERVED))('%s répond 401 sans jeton', async (name, [method, init]) => {
    const response = await apiRequest(API_PATHS[name as keyof typeof SERVED], { method, ...init });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(
      name === 'mcp' ? MCP_CHALLENGE : 'Bearer',
    );
  });

  it.each(PUBLIC)('%s répond 400 à un corps invalide, sans jeton ni session', async (name) => {
    const response = await apiRequest(API_PATHS[name], { body: {} });
    expect(response.status).toBe(400);
    expect(response.headers.get('WWW-Authenticate')).toBeNull();
  });

  // Chaque adresse que les métadonnées du serveur d'autorisation (L3) annoncent répond : les deux routes à un POST sans
  // corps valide par 400 (ni 404 ni 401), la page d'autorisation par son fichier (metadata.contrat.test.ts).
  it.each(['registration_endpoint', 'token_endpoint'] as const)(
    '%s des métadonnées répond 400 à un POST sans corps valide',
    async (field) => {
      const { pathname } = new URL(AUTHORIZATION_SERVER_METADATA[field]);
      expect(pathname).toBe(API_PATHS[field === 'token_endpoint' ? 'oauthJeton' : 'oauthClients']);
      expect((await apiRequest(pathname, { body: {} })).status).toBe(400);
    },
  );

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
        // La marque des tours injectés (T43) est au contrat : le serveur l'accepte avant que la CLI ne l'envoie.
        {
          external_id: 'msg-2',
          role: 'user',
          text: 'Rapport du sous-agent',
          ts: '2026-10-13T09:01:00+02:00',
          capture_mode: 'network',
          injecte: true,
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
    // Le retrait de l'accord d'un outil (`leon retirer-crochets`) : 204, sans corps.
    const retrait = await apiRequest(API_PATHS.retrait, {
      token,
      body: RetraitRequestSchema.parse({
        outil: 'claude_code',
        retire_le: '2026-11-10T10:00:00.000Z',
      }),
    });

    // `leon login` : le jeton que la CLI vient de tirer, enregistré contre le code signé que la page d'autorisation lui a rendu.
    const computerToken = generateApiToken();
    const ordinateurs = await apiRequest(API_PATHS.ordinateurs, {
      token: computerToken,
      body: {
        code: signComputerCode({
          e: hashApiToken(computerToken),
          u: paul.userId,
          t: paul.tenantId,
        }),
        nom: 'MacBook-Pro',
      },
    });

    expect([
      me.status,
      ingest.status,
      briefing.status,
      faits.status,
      contexte.status,
      retrait.status,
      ordinateurs.status,
    ]).toEqual([200, 202, 200, 202, 200, 204, 201]);
    const profile = ViewerProfileSchema.parse(await me.json());
    expect(profile.userId).toBe(paul.userId);
    expect(IngestResultSchema.parse(await ingest.json()).inserted).toBe(2);
    expect(BriefingResponseSchema.parse(await briefing.json()).projet).toBeNull();
    expect(ContextResponseSchema.parse(await contexte.json()).texte).not.toBe('');
    expect(ComputerResponseSchema.parse(await ordinateurs.json())).toMatchObject({
      ordinateur: 'MacBook-Pro',
      compte: profile.email,
      usages: [],
      refus: [],
    });
  });
});

// Les cases de la page « Autoriser » (T64, C16) : la 201 les rend sous la forme que `leon login` lit.
it('POST /api/v1/ordinateurs rend les cases de la page sous la forme que la CLI lit', async () => {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const token = generateApiToken();

  const response = await apiRequest(API_PATHS.ordinateurs, {
    token,
    body: {
      code: signComputerCode({
        e: hashApiToken(token),
        u: paul.userId,
        t: paul.tenantId,
        m: ['lecture'],
        g: ['lecture'],
      }),
      nom: 'MacBook-Pro',
    },
  });

  expect(response.status).toBe(201);
  expect(ComputerResponseSchema.parse(await response.json())).toMatchObject({
    usages: ['lecture'],
    refus: [],
  });
});

// Les lectures (C9, C11, C12) : `{ texte }`, même pour un fil introuvable, que la CLI ne lit jamais comme un 404.
it('les routes de lecture rendent des réponses conformes au schéma que la CLI valide', async () => {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const { token } = await createApiToken(paul, 'test');
  const base = { projet: 'github.com/acme/leon', usages: ['lecture'] };
  const id = crypto.randomUUID();

  const responses = await Promise.all([
    apiRequest(API_PATHS.dossier, { token, body: { ...base, branche: null } }),
    apiRequest(API_PATHS.fil, { token, body: { ...base, id } }),
    apiRequest(API_PATHS.chercher, { token, body: { ...base, requete: 'reprise' } }),
    apiRequest(API_PATHS.versions, { token, body: { ...base, id, n: 1 } }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  for (const response of responses) {
    expect(ReadResponseSchema.parse(await response.json()).texte).not.toBe('');
  }
});

// Rien ne restaure une version par le poste ni par le MCP (D33, tranché le 05/11), une note comprise (T57), et rien n'y
// écrit, ne corrige ni ne retire une leçon : seules les actions du site le font (T55).
it('aucune route à jeton ni aucun outil MCP ne restaure une version, ni n’écrit, ne corrige ou ne retire une leçon', () => {
  const offenders = productionSources('src/server/api/**/*.ts', 'src/server/mcp/**/*.ts')
    .filter(({ text }) =>
      /\b(restoreVersion|restoreMemoryVersion|restoreNote|writeLesson|correctLesson|retireLesson)\b/.test(
        text,
      ),
    )
    .map(({ path }) => path);
  expect(offenders).toEqual([]);
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
