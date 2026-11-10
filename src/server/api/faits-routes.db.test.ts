import { and, eq, sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, FAITS_BODY_MAX_BYTES, RETRAIT_BODY_MAX_BYTES } from '@/capture/api-contract';
import { SECRET_MASK } from '@/capture/mask-secrets';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { apiRequest } from '@/test/api-request';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Les files du résumé (T23) et du rangement (T40) sont simulées : le vrai pg-boss est vérifié dans
// resume-queue.db.test.ts et threads-queue.db.test.ts.
const { enqueueResume, enqueueRangement } = vi.hoisted(() => ({
  enqueueResume: vi.fn(),
  enqueueRangement: vi.fn(),
}));
vi.mock('@/server/sessions/resume-queue', () => ({ enqueueResume }));
vi.mock('@/server/sessions/threads-queue', () => ({ enqueueRangement }));
beforeEach(() => {
  enqueueResume.mockReset();
  enqueueResume.mockResolvedValue(undefined);
  enqueueRangement.mockReset();
  enqueueRangement.mockResolvedValue(undefined);
});

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members;
  if (!paul || !marie) throw new Error('membres de test manquants');
  const { id, token } = await createApiToken(paul, 'test');
  return { paul, marie, paulToken: token, paulTokenId: id };
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

// Les dates du poste, une même horloge : l'accord et le retrait (consent.ts).
const AVANT = '2026-11-10T09:00:00.000Z';
const RETIRE_LE = '2026-11-10T10:00:00.000Z';
const ENTRE = '2026-11-10T10:30:00.000Z';
const APRES = '2026-11-10T11:00:00.000Z';

const validBody = (externalId = `session-${crypto.randomUUID()}`) => ({
  kind: 'claude_code',
  external_id: externalId,
  project: 'github.com/acme/leon',
  accord: 2,
  faits: facts(),
  fin: false,
});

// L'heure de Postgres, qui date `faits_le` et `fin_le` (now()) : celle de Node peut s'en écarter (base dans Docker).
async function dbNow(): Promise<number> {
  const { rows } = await adminDb.execute<{ ms: number }>(
    sql`select (extract(epoch from now()) * 1000)::float8 as ms`,
  );
  return Number(rows[0]?.ms);
}

type Settled<T> = { promise: Promise<T>; done: boolean };
// Une requête lancée sans l'attendre : `done` dit si elle a fini.
function settled<T>(promise: Promise<T>): Settled<T> {
  const state = { promise, done: false };
  const finish = () => {
    state.done = true;
  };
  promise.then(finish, finish);
  return state;
}

// La table de la ligne qu'une requête attend, bloquée par la transaction de ce client (5 s au plus).
async function blockedOn(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waiting = await adminPool.query<{ relation: string }>(
      `select l.relation::regclass::text as relation from pg_locks l
       where l.locktype = 'tuple' and $1 = any(pg_blocking_pids(l.pid))`,
      [rows[0]?.pid],
    );
    if (waiting.rows[0]) return waiting.rows[0].relation;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('aucune requête n’attend la transaction');
}

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
          usages: [],
          fin: true,
          fin_le: expect.any(String),
          faits_le: expect.any(String),
        },
      },
    ]);
  });

  // `faits_le` date chaque envoi, avec ou sans fin : le résumé ne s'écrit que dans l'heure qui suit (resume-worker.ts).
  it('date chaque envoi de faits, même sans fin', async () => {
    const { paul, paulToken } = await setup();
    const body = validBody();
    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const [first] = await storedMetadata(paul, body.external_id);
    expect(Date.parse(String(first?.metadata.faits_le))).toBeGreaterThan((await dbNow()) - 60_000);
    await adminDb
      .update(sources)
      .set({ metadata: { ...first?.metadata, faits_le: '2026-11-01T10:00:00+00:00' } })
      .where(eq(sources.externalId, body.external_id));

    await apiRequest(API_PATHS.faits, { token: paulToken, body });

    const [stored] = await storedMetadata(paul, body.external_id);
    expect(Date.parse(String(stored?.metadata.faits_le))).toBeGreaterThan((await dbNow()) - 60_000);
  });

  // C2 et C7 révisé : les usages de l'outil sur le poste, rangés à chaque envoi ; absents, aucun (un usage absent vaut
  // refus), comme ceux d'une CLI d'avant eux.
  it('range les usages reçus, et les remplace à chaque envoi', async () => {
    const { paul, paulToken } = await setup();
    const body = { ...validBody(), usages: ['resume', 'lecture'] };

    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const [first] = await storedMetadata(paul, body.external_id);
    const { usages: _usages, ...withoutUsages } = body;
    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body: withoutUsages });

    expect(response.status).toBe(202);
    expect(first?.metadata.usages).toEqual(['resume', 'lecture']);
    expect((await storedMetadata(paul, body.external_id))[0]?.metadata.usages).toEqual([]);
  });

  it('répond 400 à un usage inconnu', async () => {
    const { paulToken } = await setup();
    const body = { ...validBody(), usages: ['resume', 'tout'] };

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid request',
      issues: [{ path: 'usages.1', code: 'invalid_value' }],
    });
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
      usages: [],
      fin: false,
      faits_le: expect.any(String),
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
    expect(Date.parse(String(closed?.metadata.fin_le))).toBeGreaterThan((await dbNow()) - 60_000);
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...first, fin: false },
    });

    expect(response.status).toBe(202);
    const [stored] = await storedMetadata(paul, first.external_id);
    expect(stored?.metadata.fin).toBe(true);
    expect(stored?.metadata.fin_le).toBe(closed?.metadata.fin_le);
  });

  it('fin sans l’usage resume : aucun job, même s’il était là à l’envoi d’avant', async () => {
    const { paulToken } = await setup();
    const body = { ...validBody(), accord: 3, usages: ['resume'] };

    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, usages: ['lecture'], fin: true },
    });

    expect(response.status).toBe(202);
    expect(enqueueResume.mock.calls.map(([, options]) => options)).toEqual([{ fin: false }]);
  });

  it('avec l’usage resume : met la session en file, avec sa fin', async () => {
    const { paul, paulToken } = await setup();
    const body = { ...validBody(), usages: ['resume'] };

    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, fin: true },
    });

    expect(response.status).toBe(202);
    const [source] = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, body.external_id)));
    const job = { tenantId: paul.tenantId, sourceId: source?.id, ownerUserId: paul.userId };
    expect(enqueueResume.mock.calls).toEqual([
      [job, { fin: false }],
      [job, { fin: true }],
    ]);
  });

  it('sans aucun usage : met la session en file de rangement, avec sa fin (T40)', async () => {
    const { paul, paulToken } = await setup();
    const body = validBody();

    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, fin: true },
    });

    expect(response.status).toBe(202);
    const [source] = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, body.external_id)));
    const job = { tenantId: paul.tenantId, sourceId: source?.id, ownerUserId: paul.userId };
    expect(enqueueRangement.mock.calls).toEqual([
      [job, { fin: false }],
      [job, { fin: true }],
    ]);
    expect(enqueueResume).not.toHaveBeenCalled();
  });

  it('une file indisponible ne fait pas perdre les faits : 202', async () => {
    const { paul, paulToken } = await setup();
    const body = { ...validBody(), usages: ['resume'] };
    enqueueResume.mockRejectedValue(new Error('pg-boss en panne'));
    enqueueRangement.mockRejectedValue(new Error('pg-boss en panne'));

    const response = await apiRequest(API_PATHS.faits, {
      token: paulToken,
      body: { ...body, fin: true },
    });

    expect(response.status).toBe(202);
    expect((await storedMetadata(paul, body.external_id))[0]?.metadata.fin).toBe(true);
  });
});

// Le retrait de l'accord atteint le serveur (T43, amendé le 06/11) : il vide les usages de toutes les sessions de
// l'outil dont le porteur est l'auteur. Le résumé et l'état du fil relisent l'usage : plus rien ne part au modèle.
describe('POST /api/v1/retrait', () => {
  // Une session de ce membre pour cet outil, envoyée par la route des faits avec ces usages.
  async function sent(token: string, kind: string, usages: string[]) {
    const body = { ...validBody(), kind, usages };
    expect((await apiRequest(API_PATHS.faits, { token, body })).status).toBe(202);
    return body;
  }

  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.retrait, { body: { outil: 'claude_code' } });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  // `retire_le` est obligatoire : sans lui, le serveur ne saurait pas quels faits suivent le retrait.
  it.each([
    [{ outil: 'claude_ai', retire_le: RETIRE_LE }],
    [{ outil: 'claude_code', retire_le: RETIRE_LE, tout: true }],
    [{ outil: 'claude_code' }],
    [{ outil: 'claude_code', retire_le: '2026-11-10' }],
    [{ outil: 'claude_code', retire_le: '2026-11-10T10:00:00' }],
    [{}],
  ])('répond 400 à %j', async (body) => {
    const { paulToken } = await setup();
    const response = await apiRequest(API_PATHS.retrait, { token: paulToken, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request' });
  });

  it('répond 413 à un corps de 1 Kio + 1 octet', async () => {
    const { paulToken } = await setup();
    const envelope = JSON.stringify('');
    const filler = 'a'.repeat(RETRAIT_BODY_MAX_BYTES + 1 - envelope.length);

    const response = await apiRequest(API_PATHS.retrait, { token: paulToken, body: filler });

    expect(response.status).toBe(413);
  });

  it('vide les usages des sessions de l’outil du porteur, ni d’un autre outil ni d’un collègue', async () => {
    const { paul, marie, paulToken } = await setup();
    const { token: marieToken } = await createApiToken(marie, 'test');
    const first = await sent(paulToken, 'claude_code', ['resume', 'lecture']);
    const second = await sent(paulToken, 'claude_code', ['resume']);
    const codex = await sent(paulToken, 'codex', ['resume']);
    const hers = await sent(marieToken, 'claude_code', ['resume']);
    // Sa session partagée avec Paul : il la lit, elle reste à elle.
    await adminDb
      .update(sources)
      .set({ acl: [marie.userId, paul.userId] })
      .where(eq(sources.externalId, hers.external_id));

    const response = await apiRequest(API_PATHS.retrait, {
      token: paulToken,
      body: { outil: 'claude_code', retire_le: RETIRE_LE },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const usages = async (owner: TenantContext, externalId: string) =>
      (await storedMetadata(owner, externalId))[0]?.metadata.usages;
    expect(await usages(paul, first.external_id)).toEqual([]);
    expect(await usages(paul, second.external_id)).toEqual([]);
    expect(await usages(paul, codex.external_id)).toEqual(['resume']);
    expect(await usages(marie, hers.external_id)).toEqual(['resume']);
    // Les faits restent : seul l'accord est retiré.
    expect((await storedMetadata(paul, first.external_id))[0]?.metadata.faits).toEqual(facts());

    // Un nouvel accord, postérieur au retrait : l'envoi de faits suivant rouvre la session (record-facts.ts).
    await apiRequest(API_PATHS.faits, { token: paulToken, body: { ...first, accord_le: APRES } });
    expect(await usages(paul, first.external_id)).toEqual(['resume', 'lecture']);
  });
});

// Le retrait daté (T43, amendé le 10/11) : le serveur garde, par jeton (l'ordinateur) et par outil, la date du dernier
// retrait. Des faits envoyés sous un accord qui ne lui est pas postérieur, partis avant lui mais arrivés après, ne
// remettent aucun usage : la session ne part plus au modèle.
describe('le retrait daté', () => {
  const withdraw = (token: string, outil = 'claude_code', retire_le = RETIRE_LE) =>
    apiRequest(API_PATHS.retrait, { token, body: { outil, retire_le } });
  const resumeBody = (extra: Record<string, unknown> = {}) => ({
    ...validBody(),
    usages: ['resume'],
    ...extra,
  });
  const usagesOf = async (owner: TenantContext, externalId: string) =>
    (await storedMetadata(owner, externalId))[0]?.metadata.usages;

  it.each([
    ['un accord plus ancien que le retrait', { accord_le: AVANT }],
    ['un accord de la même milliseconde', { accord_le: RETIRE_LE }],
    ['aucune date d’accord', {}],
  ])('des faits avec %s arrivent sans usage, et sans résumé en file', async (_, extra) => {
    const { paul, paulToken } = await setup();
    expect((await withdraw(paulToken)).status).toBe(204);
    const body = resumeBody(extra);

    const response = await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(response.status).toBe(202);
    expect(await usagesOf(paul, body.external_id)).toEqual([]);
    expect(enqueueResume).not.toHaveBeenCalled();
    // Les faits et le rangement restent : seul l'usage est retiré.
    expect((await storedMetadata(paul, body.external_id))[0]?.metadata.faits).toEqual(facts());
    expect(enqueueRangement).toHaveBeenCalledTimes(1);
  });

  it('des faits sous un accord postérieur au retrait rouvrent les usages', async () => {
    const { paul, paulToken } = await setup();
    await withdraw(paulToken);
    const body = resumeBody({ accord_le: APRES });

    await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(await usagesOf(paul, body.external_id)).toEqual(['resume']);
    expect(enqueueResume).toHaveBeenCalledTimes(1);
  });

  // Par jeton, pas par personne : un retrait sur un ordinateur ne coupe pas le résumé d'un autre qui garde son accord.
  it('la date d’un ordinateur ne touche pas les faits d’un autre ordinateur de la même personne', async () => {
    const { paul, paulToken } = await setup();
    const { token: otherComputer } = await createApiToken(paul, 'autre ordinateur');
    await withdraw(paulToken);
    const body = resumeBody({ accord_le: AVANT });

    await apiRequest(API_PATHS.faits, { token: otherComputer, body });

    expect(await usagesOf(paul, body.external_id)).toEqual(['resume']);
  });

  it('la date d’un outil ne touche pas les faits d’un autre outil', async () => {
    const { paul, paulToken } = await setup();
    await withdraw(paulToken, 'codex');
    const body = resumeBody({ accord_le: AVANT });

    await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(await usagesOf(paul, body.external_id)).toEqual(['resume']);
  });

  it('deux retraits gardent la plus grande date', async () => {
    const { paul, paulToken } = await setup();
    await withdraw(paulToken, 'claude_code', APRES);
    await withdraw(paulToken, 'claude_code', RETIRE_LE);
    const body = resumeBody({ accord_le: ENTRE });

    await apiRequest(API_PATHS.faits, { token: paulToken, body });

    expect(await usagesOf(paul, body.external_id)).toEqual([]);
  });

  // L'ordre des deux requêtes, sur deux connexions : la transaction tenue ouverte ici joue l'une, la route l'autre.
  // Un premier envoi crée la session et fait servir le jeton : verifyApiToken n'écrit pas last_used_at dans la minute
  // (LAST_USED_PRECISION_MS), seule la route attend donc la ligne du jeton.
  it('un envoi de faits qui a lu le jeton fait attendre le retrait, qui vide ensuite ses usages', async () => {
    const { paul, paulToken, paulTokenId } = await setup();
    const body = resumeBody();
    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    const client = await adminPool.connect();
    try {
      // Ce que fait recordFacts : le jeton lu FOR SHARE, puis les usages écrits, avant le commit.
      await client.query('begin');
      await client.query('select 1 from api_tokens where id = $1 for share', [paulTokenId]);
      const withdrawal = settled(withdraw(paulToken));
      expect(await blockedOn(client)).toBe('api_tokens');
      expect(withdrawal.done).toBe(false);
      await client.query(
        `update sources set metadata = metadata || '{"usages": ["resume"]}'::jsonb where external_id = $1`,
        [body.external_id],
      );
      await client.query('commit');
      expect((await withdrawal.promise).status).toBe(204);
    } finally {
      await client.query('rollback'); // sans effet après le commit ; débloque la route si un test échoue avant
      client.release();
    }

    expect(await usagesOf(paul, body.external_id)).toEqual([]);
  });

  it('un retrait en cours fait attendre l’envoi de faits, qui lit ensuite sa date', async () => {
    const { paul, paulToken, paulTokenId } = await setup();
    const body = resumeBody({ accord_le: AVANT });
    await apiRequest(API_PATHS.faits, { token: paulToken, body });
    enqueueResume.mockClear();
    const client = await adminPool.connect();
    try {
      // Ce que fait la route du retrait : la date posée sur le jeton, puis les usages vidés, avant le commit.
      await client.query('begin');
      await client.query(
        `update api_tokens set retraits = jsonb_build_object('claude_code', $2::text) where id = $1`,
        [paulTokenId, RETIRE_LE],
      );
      await client.query(
        `update sources set metadata = metadata || '{"usages": []}'::jsonb where external_id = $1`,
        [body.external_id],
      );
      const sending = settled(apiRequest(API_PATHS.faits, { token: paulToken, body }));
      expect(await blockedOn(client)).toBe('api_tokens');
      expect(sending.done).toBe(false);
      await client.query('commit');
      expect((await sending.promise).status).toBe(202);
    } finally {
      await client.query('rollback');
      client.release();
    }

    expect(await usagesOf(paul, body.external_id)).toEqual([]);
    expect(enqueueResume).not.toHaveBeenCalled();
  });
});
