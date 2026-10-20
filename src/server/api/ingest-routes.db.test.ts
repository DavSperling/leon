import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, ViewerProfileSchema } from '@/capture/api-contract';
import { INGEST_BODY_MAX_BYTES, IngestResultSchema } from '@/capture/turn';
import { createApiToken } from '@/server/auth/api-tokens';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestTenant } from '@/test/fixtures';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members;
  if (!paul || !marie) throw new Error('membres de test manquants');
  const [paulToken, marieToken] = await Promise.all([
    createApiToken(paul, 'test'),
    createApiToken(marie, 'test'),
  ]);
  return { paul, paulToken: paulToken.token, marieToken: marieToken.token };
}

const validBody = (externalId = `conv-${crypto.randomUUID()}`) => ({
  source: { kind: 'claude_ai', external_id: externalId, title: 'Relance ACME' },
  turns: [
    {
      external_id: 'msg-1',
      role: 'user',
      text: 'Bonjour',
      ts: '2026-10-13T09:00:00+02:00',
      capture_mode: 'network',
    },
  ],
});

describe('POST /api/v1/ingest', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.ingest, { body: validBody() });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('répond 202 avec un résultat conforme à IngestResultSchema', async () => {
    const { paulToken } = await setup();
    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: validBody() });
    expect(response.status).toBe(202);
    expect(IngestResultSchema.parse(await response.json())).toMatchObject({
      inserted: 1,
      skipped: 0,
    });
  });

  it('répond 400 sans jamais renvoyer les valeurs reçues', async () => {
    const { paulToken } = await setup();
    const body = validBody();
    const bad = { ...body, turns: [{ ...body.turns[0], role: 'secret-xyz' }] };

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: bad });

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('secret-xyz');
    expect(JSON.parse(text)).toEqual({
      error: 'Requête invalide',
      issues: [{ path: 'turns.0.role', code: 'invalid_value' }],
    });
  });

  it("répond 400 au type d'un connecteur : un jeton d'appareil ne fabrique pas de source github", async () => {
    const { paulToken } = await setup();
    const body = validBody();
    const bad = { ...body, source: { ...body.source, kind: 'github' } };

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: bad });

    expect(response.status).toBe(400);
    expect(JSON.parse(await response.text())).toEqual({
      error: 'Requête invalide',
      issues: [{ path: 'source.kind', code: 'invalid_value' }],
    });
  });

  it('range la clé de projet dans metadata.project de la source', async () => {
    const { paul, paulToken } = await setup();
    const body = validBody();
    const withProject = {
      ...body,
      source: { ...body.source, kind: 'claude_code', project: 'github.com/acme/leon' },
    };

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: withProject });

    expect(response.status).toBe(202);
    const { sourceId } = IngestResultSchema.parse(await response.json());
    const [stored] = await withTenant(paul, (tx) =>
      tx.select({ metadata: sources.metadata }).from(sources).where(eq(sources.id, sourceId)),
    );
    expect(stored?.metadata).toMatchObject({ project: 'github.com/acme/leon' });
  });

  it("répond 400 à un projet qui n'est pas une clé, sans renvoyer la valeur reçue", async () => {
    const { paulToken } = await setup();
    const body = validBody();
    const bad = { ...body, source: { ...body.source, project: 'evil' } };

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: bad });

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('evil');
    expect(JSON.parse(text)).toEqual({
      error: 'Requête invalide',
      issues: [{ path: 'source.project', code: 'invalid_format' }],
    });
  });

  it('répond 400 à une adresse de dépôt en guise de clé : la clé ne porte jamais de jeton', async () => {
    const { paulToken } = await setup();
    const body = validBody();
    const bad = {
      ...body,
      source: { ...body.source, project: 'https://utilisateur:jeton@github.com/acme/leon.git' },
    };

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: bad });

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('jeton');
  });

  it('répond 400 à un corps vide', async () => {
    const { paulToken } = await setup();
    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, method: 'POST' });
    expect(response.status).toBe(400);
  });

  it('répond 413 à un corps de 2 Mio + 1 octet', async () => {
    const { paulToken } = await setup();
    const envelope = JSON.stringify('');
    const filler = 'a'.repeat(INGEST_BODY_MAX_BYTES + 1 - envelope.length);

    const response = await apiRequest(API_PATHS.ingest, { token: paulToken, body: filler });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Requête trop volumineuse' });
  });

  it('isole la même conversation envoyée par deux collègues, sans rien révéler', async () => {
    // Une source par propriétaire : rien ne révèle qu'un collègue a déjà envoyé la même conversation.
    const { paulToken, marieToken } = await setup();
    const body = validBody();
    const send = async (token: string) =>
      IngestResultSchema.parse(await (await apiRequest(API_PATHS.ingest, { token, body })).json());
    const fromPaul = await send(paulToken);

    const response = await apiRequest(API_PATHS.ingest, { token: marieToken, body });

    expect(response.status).toBe(202);
    const fromMarie = IngestResultSchema.parse(await response.json());
    expect(fromMarie).toMatchObject({ inserted: 1, skipped: 0 });
    expect(fromMarie.sourceId).not.toBe(fromPaul.sourceId);
    expect(await send(paulToken)).toMatchObject({ sourceId: fromPaul.sourceId, inserted: 0 });
  });

  it("n'envoie aucun en-tête CORS", async () => {
    const { paulToken } = await setup();
    const responses = [
      await apiRequest(API_PATHS.ingest, { body: validBody() }),
      await apiRequest(API_PATHS.ingest, { token: paulToken, body: validBody() }),
      await apiRequest(API_PATHS.me, { token: paulToken }),
    ];
    for (const response of responses) {
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });
});

describe('GET /api/v1/me', () => {
  it('renvoie un profil conforme à ViewerProfileSchema', async () => {
    const { paul, paulToken } = await setup();
    const response = await apiRequest(API_PATHS.me, { token: paulToken });
    expect(response.status).toBe(200);
    expect(ViewerProfileSchema.parse(await response.json())).toMatchObject({
      userId: paul.userId,
      tenantId: paul.tenantId,
      userName: 'Paul',
    });
  });

  it('répond 401 sans jeton', async () => {
    expect((await apiRequest(API_PATHS.me)).status).toBe(401);
  });
});
