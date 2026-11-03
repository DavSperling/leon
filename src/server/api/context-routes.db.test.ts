import { describe, expect, it } from 'vitest';
import {
  API_PATHS,
  CONTEXT_BODY_MAX_BYTES,
  CONTEXT_MAX_BYTES,
  ContextResponseSchema,
} from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import { BRIEFING_BLOCK_CLOSE, renderBriefing } from '@/server/briefing/briefing-prompt';
import { sources } from '@/server/db/schema/memory';
import { briefings } from '@/server/db/schema/search';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

const PROJECT = 'github.com/acme/leon';
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

async function setup() {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const { token } = await createApiToken(paul, 'test');
  return { paul, token };
}

const body = (extra: Record<string, unknown> = {}) => ({
  projet: PROJECT,
  branche: 'paul/contexte',
  session: 'session-courante',
  ...extra,
});

describe('POST /api/v1/contexte', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.contexte, { body: body() });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it.each([
    ['sans projet', { projet: undefined }],
    ['avec une adresse de remote', { projet: 'https://jeton@github.com/acme/leon.git' }],
    ['avec un champ inconnu', { mot_de_passe: 'S3cret-xyz' }],
    ['avec un max nul', { max: 0 }],
  ])('répond 400 %s, sans recopier la valeur reçue', async (_cas, extra) => {
    const { token } = await setup();

    const response = await apiRequest(API_PATHS.contexte, { token, body: body(extra) });

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('jeton@');
    expect(text).not.toContain('S3cret-xyz');
  });

  it('répond 413 à un corps de 4 Kio + 1 octet', async () => {
    const { token } = await setup();
    const envelope = JSON.stringify('');
    const filler = 'a'.repeat(CONTEXT_BODY_MAX_BYTES + 1 - envelope.length);

    const response = await apiRequest(API_PATHS.contexte, { token, body: filler });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request too large' });
  });

  it('borne le bloc à 8 000 octets, même quand on en demande plus, et à `max` en dessous', async () => {
    const { paul, token } = await setup();
    const taches = Array.from({ length: 20 }, (_, i) => ({
      texte: `Tâche ${i} ${'é'.repeat(150)}`,
      etat: 'a_faire',
    }));
    for (let n = 0; n < 4; n++) {
      await adminDb.insert(sources).values({
        tenantId: paul.tenantId,
        kind: 'claude_code',
        externalId: crypto.randomUUID(),
        ownerUserId: paul.userId,
        acl: [paul.userId],
        metadata: {
          project: PROJECT,
          branche: 'paul/contexte',
          faits: {
            branche: 'paul/contexte',
            prs: [],
            commits: [],
            fichiers: [],
            commandes: [],
            taches,
            erreurs: 0,
            externe: false,
            echanges: 1,
            debut: null,
            fin: null,
          },
        },
        lastTurnAt: new Date(),
      });
    }
    const body5000 = Array.from({ length: 200 }, (_, i) => `- ligne ${i} : éàèùéàèùéàèù`).join(
      '\n',
    );
    await adminDb.insert(briefings).values({
      tenantId: paul.tenantId,
      userId: paul.userId,
      project: PROJECT,
      markdown: renderBriefing({
        project: PROJECT,
        preparedAt: new Date(),
        body: body5000,
        references: [],
      }),
      sourceIds: [],
      preparedAt: new Date(),
      stale: false,
      acl: [paul.userId],
    });

    const texts: string[] = [];
    for (const max of [100_000, undefined, 1500]) {
      const response = await apiRequest(API_PATHS.contexte, { token, body: body({ max }) });
      expect(response.status).toBe(200);
      texts.push(ContextResponseSchema.parse(await response.json()).texte);
    }

    const [asked, byDefault, small] = texts as [string, string, string];
    expect(bytes(asked)).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(bytes(asked)).toBeGreaterThan(CONTEXT_MAX_BYTES - 100);
    expect(asked).toContain('<contexte-leon>');
    expect(asked.endsWith(BRIEFING_BLOCK_CLOSE)).toBe(true);
    expect(byDefault).toBe(asked);
    expect(bytes(small)).toBeLessThanOrEqual(1500);
    expect(small).toContain('<contexte-leon>');
  });
});
