import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, FAITS_BODY_MAX_BYTES } from '@/capture/api-contract';
import { SECRET_MASK } from '@/capture/mask-secrets';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// La file du résumé (T23) est simulée : le vrai pg-boss est vérifié dans resume-queue.db.test.ts.
const { enqueueResume } = vi.hoisted(() => ({ enqueueResume: vi.fn() }));
vi.mock('@/server/sessions/resume-queue', () => ({ enqueueResume }));
beforeEach(() => {
  enqueueResume.mockReset();
  enqueueResume.mockResolvedValue(undefined);
});

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members;
  if (!paul || !marie) throw new Error('membres de test manquants');
  const { token } = await createApiToken(paul, 'test');
  return { paul, marie, paulToken: token };
}

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/faits',
  prs: [{ repo: 'acme/leon', numero: 110, par: 'pr-link' }],
  commits: ['1a2b3c4'],
  fichiers: ['src/server/api/faits-routes.ts'],
  commandes: [{ texte: 'pnpm vitest', erreur: false }],
  taches: [{ texte: 'Brancher la route', etat: 'en_cours' }],
  erreurs: 0,
  externe: false,
  echanges: 3,
  debut: '2026-11-02T10:00:00+01:00',
  fin: '2026-11-02T11:00:00+01:00',
  ...extra,
});

const validBody = (externalId = `session-${crypto.randomUUID()}`) => ({
  kind: 'claude_code',
  external_id: externalId,
  project: 'github.com/acme/leon',
  accord: 2,
  faits: facts(),
  fin: false,
});

// Les métadonnées des sources que ce membre possède pour cette session, lues hors RLS.
async function storedMetadata(owner: TenantContext, externalId: string) {
  const rows = await adminDb
    .select({ metadata: sources.metadata, acl: sources.acl })
    .from(sources)
    .where(
      and(
        eq(sources.tenantId, owner.tenantId),
        eq(sources.ownerUserId, owner.userId),
        eq(sources.externalId, externalId),
      ),
    );
  return rows;
}

describe('POST /api/v1/faits', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.faits, { body: validBody() });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('répond 202 et range les faits, la branche, l’accord, la fin et le projet de la source', async () => {
    const { paul, paulToken } = await setup();
    const body = { ...validBody(), accord: 3, fin: true };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    expect(await storedMetadata(paul, body.external_id)).toEqual([
      {
        acl: [paul.userId],
        metadata: {
          project: 'github.com/acme/leon',
          faits: facts(),
          branche: 'paul/faits',
          accord: 3,
          fin: true,
          fin_le: expect.any(String),
        },
      },
    ]);
  });

  it.each([
    ['privée', (marie: TenantContext) => [marie.userId]],
    [
      'partagée avec le porteur',
      (marie: TenantContext, paul: TenantContext) => [marie.userId, paul.userId],
    ],
  ])(
    'la session %s d’un collègue reste intacte : le porteur reçoit sa propre source',
    async (_cas, aclOf) => {
      const { paul, marie, paulToken } = await setup();
      const externalId = `session-${crypto.randomUUID()}`;
      const marieMetadata = {
        project: 'github.com/acme/leon',
        faits: facts({ branche: 'marie/branche' }),
        branche: 'marie/branche',
        accord: 2,
      };
      await adminDb.insert(sources).values({
        tenantId: marie.tenantId,
        kind: 'claude_code',
        externalId,
        ownerUserId: marie.userId,
        acl: aclOf(marie, paul),
        metadata: marieMetadata,
      });

      const response = await apiRequest(API_PATHS.faits, {
        token: paulToken,
        body: validBody(externalId),
      });

      expect(response.status).toBe(202);
      expect(await storedMetadata(paul, externalId)).toEqual([
        { acl: [paul.userId], metadata: expect.objectContaining({ branche: 'paul/faits' }) },
      ]);
      expect(await storedMetadata(marie, externalId)).toEqual([
        { acl: aclOf(marie, paul), metadata: marieMetadata },
      ]);
    },
  );

  it('répond 400 à un type qui n’est pas une session de code', async () => {
    const { paulToken } = await setup();
    const body = { ...validBody(), kind: 'claude_ai' };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid request',
      issues: [{ path: 'kind', code: 'invalid_value' }],
    });
  });

  // Le résumé suit l'usage `resume`, pas la version (C7 révisé) : 3 et 4 restent acceptées, une version inconnue non.
  it.each([1, 5])('répond 400 à la version d’accord %i', async (accord) => {
    const { paulToken } = await setup();
    const body = { ...validBody(), accord };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid request',
      issues: [{ path: 'accord', code: accord === 1 ? 'too_small' : 'too_big' }],
    });
  });

  it('répond 400 à un champ inconnu, sans jamais renvoyer les valeurs reçues', async () => {
    const { paulToken } = await setup();
    const body = { ...validBody(), mot_de_passe: 'S3cret-xyz' };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('S3cret-xyz');
    expect(JSON.parse(text)).toEqual({
      error: 'Invalid request',
      issues: [{ path: '', code: 'unrecognized_keys' }],
    });
  });

  it('répond 413 à un corps de 64 Kio + 1 octet', async () => {
    const { paulToken } = await setup();
    const envelope = JSON.stringify('');
    const filler = 'a'.repeat(FAITS_BODY_MAX_BYTES + 1 - envelope.length);

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body: filler });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request too large' });
  });

  it('remplace les faits à chaque envoi, mais une session externe le reste', async () => {
    const { paul, paulToken } = await setup();
    const first = { ...validBody(), faits: facts({ externe: true }) };
    const second = {
      ...first,
      accord: 3,
      faits: facts({ branche: 'paul/suite', commandes: [{ texte: 'git push', erreur: true }] }),
    };

    await apiRequest(API_PATHS.faits, { token: paulToken, body: first });
    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body: second });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, first.external_id);
    expect(stored?.metadata).toEqual({
      project: 'github.com/acme/leon',
      faits: { ...second.faits, externe: true },
      branche: 'paul/suite',
      accord: 3,
      fin: false,
    });
  });

  it('masque en base un secret glissé dans un fait', async () => {
    const { paul, paulToken } = await setup();
    const secret = `ghp_${'a1B2'.repeat(9)}`;
    const body = {
      ...validBody(),
      faits: facts({
        branche: `paul/${secret}`,
        fichiers: [`src/${secret}.ts`, 'src/nul\u0000.ts'],
        commandes: [{ texte: `git ${secret}`, erreur: false }],
        taches: [{ texte: `Coller ${secret}`, etat: 'a_faire' }],
        prs: [
          { repo: `${secret}/leon`, numero: 1, par: 'gh-pr-create' },
          { repo: 'acme/leon', numero: 2, par: 'pr-link' },
        ],
      }),
    };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, body.external_id);
    expect(JSON.stringify(stored?.metadata)).not.toContain(secret);
    expect(stored?.metadata).toMatchObject({
      branche: `paul/${SECRET_MASK}`,
      faits: {
        fichiers: [`src/${SECRET_MASK}.ts`, 'src/nul.ts'],
        taches: [{ texte: `Coller ${SECRET_MASK}`, etat: 'a_faire' }],
        // Un dépôt masqué ne serait plus une clé de PR : la PR est retirée, le reste des faits reste lisible.
        prs: [{ repo: 'acme/leon', numero: 2, par: 'pr-link' }],
      },
    });
    expect(SessionFactsSchema.safeParse(stored?.metadata.faits).success).toBe(true);
  });

  it('ne garde d’une commande hors de la forme réduite que [commande]', async () => {
    const { paul, paulToken } = await setup();
    const texts = [
      'mysql -pS3cret',
      'PGPASSWORD=S3cret psql',
      'curl -u a:S3cret https://acme.fr',
      'git commit',
      'pnpm',
      '[commande]',
    ];
    const body = {
      ...validBody(),
      faits: facts({ commandes: texts.map((texte) => ({ texte, erreur: false })) }),
    };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, body.external_id);
    expect(JSON.stringify(stored?.metadata)).not.toContain('S3cret');
    expect(stored?.metadata).toMatchObject({
      faits: {
        commandes: [
          '[commande]',
          '[commande]',
          '[commande]',
          'git commit',
          'pnpm',
          '[commande]',
        ].map((texte) => ({ texte, erreur: false })),
      },
    });
  });

  it('réapplique la borne de 200 caractères après le masque, qui allonge le texte', async () => {
    const { paul, paulToken } = await setup();
    const url = ' postgres://u:p@h/db';
    const texte = `${'x'.repeat(200 - url.length)}${url}`;
    const body = { ...validBody(), faits: facts({ taches: [{ texte, etat: 'a_faire' }] }) };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, body.external_id);
    const [task] = SessionFactsSchema.parse(stored?.metadata.faits).taches;
    expect(task?.texte).toHaveLength(200);
    expect(task?.texte).not.toContain(':p@');
  });

  it('répond 400 à 31 commandes', async () => {
    const { paulToken } = await setup();
    const commandes = Array.from({ length: 31 }, () => ({ texte: 'git status', erreur: false }));
    const body = { ...validBody(), faits: facts({ commandes }) };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid request',
      issues: [{ path: 'faits.commandes', code: 'too_big' }],
    });
  });

  it('garde `fin` vrai une fois vu, et sa date : un rattrapage qui suit le SessionEnd ne les efface pas', async () => {
    const { paul, paulToken } = await setup();
    const first = { ...validBody(), fin: true };

    await apiRequest(API_PATHS.faits, { token: paulToken, body: first });
    const [closed] = await storedMetadata(paul, first.external_id);
    expect(Date.parse(String(closed?.metadata.fin_le))).toBeGreaterThan(Date.now() - 60_000);
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...first, fin: false },
    });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, first.external_id);
    expect(stored?.metadata.fin).toBe(true);
    expect(stored?.metadata.fin_le).toBe(closed?.metadata.fin_le);
  });

  // L'usage `resume` (C7 révisé) n'arrive dans le corps qu'avec T24 : il est rangé ici à la main.
  async function grantResume(owner: TenantContext, externalId: string) {
    await adminDb
      .update(sources)
      .set({ metadata: sql`${sources.metadata} || '{"usages":["resume"]}'::jsonb` })
      .where(and(eq(sources.ownerUserId, owner.userId), eq(sources.externalId, externalId)));
  }

  it('fin sans l’usage resume : aucun job', async () => {
    const { paulToken } = await setup();
    const body = { ...validBody(), accord: 3, fin: true };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    expect(enqueueResume).not.toHaveBeenCalled();
  });

  it('avec l’usage resume : met la session en file, avec sa fin', async () => {
    const { paul, paulToken } = await setup();
    const body = validBody();
    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    await grantResume(paul, body.external_id);
    const [source] = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, body.external_id)));

    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, fin: true },
    });

    expect(response.status).toBe(202);
    const job = { tenantId: paul.tenantId, sourceId: source?.id, ownerUserId: paul.userId };
    expect(enqueueResume.mock.calls).toEqual([
      [job, { fin: false }],
      [job, { fin: true }],
    ]);
  });

  it('une file indisponible ne fait pas perdre les faits : 202', async () => {
    const { paul, paulToken } = await setup();
    const body = validBody();
    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    await grantResume(paul, body.external_id);
    enqueueResume.mockRejectedValue(new Error('pg-boss en panne'));

    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, fin: true },
    });

    expect(response.status).toBe(202);
    expect((await storedMetadata(paul, body.external_id))[0]?.metadata.fin).toBe(true);
  });
});
