import { and, asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, COULISSES_BLOCS_MAX, COULISSES_BODY_MAX_BYTES } from '@/capture/api-contract';
import { SECRET_MASK } from '@/capture/mask-secrets';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// La route des coulisses (T51 ; C10 amendé le 12/11 du plan de la mémoire à disposition). La file de l'indexation est
// simulée : le test qui veut des passages lance indexIngestRun lui-même.
vi.mock('@/server/pipeline/queue');
beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members;
  if (!paul || !marie) throw new Error('membres de test manquants');
  const { token } = await createApiToken(paul, 'test');
  return { paul, marie, paulToken: token };
}

const TS = '2026-11-12T10:00:00+01:00';
const raisonnement = (over: Record<string, unknown> = {}) => ({
  role: 'raisonnement',
  id: 'ligne-1',
  ts: TS,
  texte: 'Je lis le fichier avant de le changer.',
  ...over,
});
const sousAgent = (over: Record<string, unknown> = {}) => ({
  role: 'sous_agent',
  id: 'toolu_01:consigne',
  ts: TS,
  partie: 'consigne',
  texte: 'Lis a.txt et résume-le.',
  ...over,
});
const appel = (over: Record<string, unknown> = {}) => ({
  role: 'appel_outil',
  id: 'toolu_02',
  ts: TS,
  outil: 'Read',
  cible: 'src/a.ts',
  statut: 'ok',
  ...over,
});
const body = (blocs: unknown[], extra: Record<string, unknown> = {}) => ({
  kind: 'claude_code',
  external_id: `session-${crypto.randomUUID()}`,
  usages: ['coulisses'],
  blocs,
  ...extra,
});
const post = (token: string, value: unknown) =>
  apiRequest(API_PATHS.coulisses, { token, body: value });

// Les tours de la session de ce membre, hors RLS, dans l'ordre de leur identifiant.
async function storedTurns(owner: TenantContext, externalId: string) {
  return adminDb
    .select({
      id: turns.id,
      externalId: turns.externalId,
      role: turns.role,
      text: turns.text,
      ts: turns.ts,
      captureMode: turns.captureMode,
      injecte: turns.injecte,
      acl: turns.acl,
    })
    .from(turns)
    .innerJoin(sources, eq(sources.id, turns.sourceId))
    .where(
      and(
        eq(sources.tenantId, owner.tenantId),
        eq(sources.ownerUserId, owner.userId),
        eq(sources.externalId, externalId),
      ),
    )
    .orderBy(asc(turns.externalId));
}
const textsOf = async (owner: TenantContext, externalId: string) =>
  (await storedTurns(owner, externalId)).map((turn) => turn.text);

describe('POST /api/v1/coulisses', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.coulisses, { body: body([raisonnement()]) });
    expect(response.status).toBe(401);
  });

  it('répond 202 et range chaque bloc comme tour de la session, sous son ACL', async () => {
    const { paul, paulToken } = await setup();
    const value = body([
      raisonnement(),
      sousAgent(),
      sousAgent({ id: 'toolu_01:rapport', partie: 'rapport', texte: 'a.txt dit bonjour.' }),
      appel(),
      appel({ id: 'toolu_03', outil: 'Grep', cible: undefined, statut: 'erreur' }),
    ]);

    const response = await post(paulToken, value);

    expect(response.status).toBe(202);
    const [source] = await adminDb
      .select({ kind: sources.kind, acl: sources.acl })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, value.external_id)));
    expect(source).toEqual({ kind: 'claude_code', acl: [paul.userId] });
    const stored = await storedTurns(paul, value.external_id);
    expect(stored.map(({ externalId, role, text }) => ({ externalId, role, text }))).toEqual([
      {
        externalId: 'coulisse:ligne-1',
        role: 'raisonnement',
        text: 'Je lis le fichier avant de le changer.',
      },
      {
        externalId: 'coulisse:toolu_01:consigne',
        role: 'sous_agent',
        text: '[consigne]\nLis a.txt et résume-le.',
      },
      {
        externalId: 'coulisse:toolu_01:rapport',
        role: 'sous_agent',
        text: '[rapport]\na.txt dit bonjour.',
      },
      { externalId: 'coulisse:toolu_02', role: 'appel_outil', text: 'Read · src/a.ts · ok' },
      { externalId: 'coulisse:toolu_03', role: 'appel_outil', text: 'Grep · erreur' },
    ]);
    for (const turn of stored) {
      expect(turn).toMatchObject({
        captureMode: 'file',
        injecte: null,
        acl: [paul.userId],
        ts: new Date(TS),
      });
    }
  });

  it('met l’indexation des tours neufs en file, une fois l’écriture validée', async () => {
    const { paulToken } = await setup();

    await post(paulToken, body([raisonnement(), appel()]));

    expect(enqueuePipelineStep).toHaveBeenCalledTimes(1);
    expect(enqueuePipelineStep).toHaveBeenCalledWith(
      'index',
      expect.objectContaining({ ingestRunId: expect.any(String) }),
    );
  });

  it('un bloc rangé devient un passage une fois indexé', async () => {
    const { paul, paulToken } = await setup();
    const value = body([raisonnement({ texte: 'Le cache de Redis tombe le lundi.' })]);

    await post(paulToken, value);
    const job = vi.mocked(enqueuePipelineStep).mock.calls.at(-1)?.[1] as { ingestRunId: string };
    await indexIngestRun(
      { ingestRunId: job.ingestRunId, tenantId: paul.tenantId, userId: paul.userId },
      { embedder: null },
    );

    const [turn] = await storedTurns(paul, value.external_id);
    const rows = await adminDb
      .select({ text: passages.text, acl: passages.acl })
      .from(passages)
      .where(eq(passages.turnId, turn?.id ?? ''));
    expect(rows).toEqual([{ text: 'Le cache de Redis tombe le lundi.', acl: [paul.userId] }]);
  });

  it.each([
    ['un appel avec un texte', [appel({ texte: 'S3cret-xyz' })]],
    ['un champ inconnu', [raisonnement({ sortie: 'S3cret-xyz' })]],
    ['un id hors forme', [raisonnement({ id: 'S3cret-xyz/../x' })]],
    [
      `${COULISSES_BLOCS_MAX + 1} blocs`,
      Array.from({ length: COULISSES_BLOCS_MAX + 1 }, (_, i) =>
        raisonnement({ id: `l${i}`, texte: 'S3cret-xyz' }),
      ),
    ],
  ])('répond 400 à %s, sans recopier une valeur reçue ni rien écrire', async (_, blocs) => {
    const { paul, paulToken } = await setup();
    const value = body(blocs);

    const response = await post(paulToken, value);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('S3cret-xyz');
    expect(JSON.parse(text)).toMatchObject({ error: 'Invalid request', issues: expect.any(Array) });
    expect(await storedTurns(paul, value.external_id)).toEqual([]);
  });

  it('répond 413 à un corps de 256 Kio + 1 octet', async () => {
    const { paulToken } = await setup();
    const filler = 'a'.repeat(COULISSES_BODY_MAX_BYTES + 1 - JSON.stringify('').length);

    const response = await post(paulToken, filler);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request too large' });
  });

  it.each([
    ['sans usages', { usages: undefined }],
    ['avec d’autres usages seulement', { usages: ['resume', 'lecture'] }],
  ])('répond 403 %s, et n’écrit rien, pas même la session', async (_, extra) => {
    const { paul, paulToken } = await setup();
    const value = body([raisonnement()], extra);

    const response = await post(paulToken, value);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Backstage not allowed' });
    const found = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, value.external_id)));
    expect(found).toEqual([]);
    expect(enqueuePipelineStep).not.toHaveBeenCalled();
  });

  it('la session d’un collègue, même partagée, reste intacte : le porteur reçoit sa propre source', async () => {
    const { paul, marie, paulToken } = await setup();
    const value = body([raisonnement()]);
    const [marieSource] = await adminDb
      .insert(sources)
      .values({
        tenantId: marie.tenantId,
        kind: 'claude_code',
        externalId: value.external_id,
        ownerUserId: marie.userId,
        acl: [marie.userId, paul.userId],
      })
      .returning({ id: sources.id });

    expect((await post(paulToken, value)).status).toBe(202);

    expect(
      await adminDb
        .select()
        .from(turns)
        .where(eq(turns.sourceId, marieSource?.id ?? '')),
    ).toEqual([]);
    expect(await textsOf(paul, value.external_id)).toEqual([
      'Je lis le fichier avant de le changer.',
    ]);
  });

  it('masque en base un faux secret glissé dans un chemin de fichier', async () => {
    const { paul, paulToken } = await setup();
    const secret = `ghp_${'a1B2'.repeat(9)}`;
    const value = body([
      appel({ cible: `src/${secret}.ts` }),
      raisonnement({ texte: `Coller ${secret}` }),
    ]);

    expect((await post(paulToken, value)).status).toBe(202);

    const texts = await textsOf(paul, value.external_id);
    expect(JSON.stringify(texts)).not.toContain(secret);
    expect(texts).toEqual([`Coller ${SECRET_MASK}`, `Read · src/${SECRET_MASK}.ts · ok`]);
  });

  it('retire un bloc de Leon d’un bloc sous_agent, et n’écrit pas un bloc vide après préparation', async () => {
    const { paul, paulToken } = await setup();
    const leon = '<contexte-leon>\nMes sessions précédentes : fil amos/login.\n</contexte-leon>';
    const value = body([
      sousAgent({ texte: `${leon}\nLis a.txt.` }),
      sousAgent({ id: 'toolu_09:rapport', partie: 'rapport', texte: leon }),
      raisonnement({ id: 'ligne-2', texte: '<system-reminder>rappel</system-reminder>' }),
    ]);

    expect((await post(paulToken, value)).status).toBe(202);

    const texts = await textsOf(paul, value.external_id);
    expect(texts).toEqual(['[consigne]\nLis a.txt.']);
    expect(JSON.stringify(texts)).not.toContain('contexte-leon');
  });

  it.each([
    [
      'un outil MCP reçu tel quel',
      { outil: 'mcp__linear__get_issue', cible: 'LIN-12' },
      'mcp:linear · ok',
    ],
    ['un outil MCP déjà réduit', { outil: 'mcp:linear', cible: undefined }, 'mcp:linear · ok'],
    ['un nom hors forme', { outil: 'outil bizarre', cible: undefined }, '[outil] · ok'],
    [
      'une commande hors forme',
      { outil: 'Bash', cible: 'curl -u a:X https://exemple.test' },
      'Bash · [commande] · ok',
    ],
    ['une commande réduite', { outil: 'Bash', cible: 'pnpm vitest' }, 'Bash · pnpm vitest · ok'],
    ['un chemin absolu', { outil: 'Edit', cible: '/etc/passwd' }, 'Edit · ok'],
    [
      'un chemin qui sort du dépôt',
      { outil: 'Write', cible: 'src/../../autre/x.ts' },
      'Write · ok',
    ],
    ['un chemin Windows', { outil: 'Read', cible: 'C:\\Users\\x.txt' }, 'Read · ok'],
    ['un chemin du dossier personnel', { outil: 'Read', cible: '~/.ssh/id_rsa' }, 'Read · ok'],
    ['un chemin de Glob', { outil: 'Glob', cible: 'src/server' }, 'Glob · src/server · ok'],
    [
      'une URL de WebFetch',
      { outil: 'WebFetch', cible: 'https://exemple.test/a?jeton=x' },
      'WebFetch · ok',
    ],
    ['un chemin sur deux lignes', { outil: 'Read', cible: 'src/a.ts\nfaux · ok' }, 'Read · ok'],
    ['une cible vide', { outil: 'Read', cible: '' }, 'Read · ok'],
  ])('revérifie l’appel : %s', async (_, over, expected) => {
    const { paul, paulToken } = await setup();
    const value = body([appel(over)]);

    expect((await post(paulToken, value)).status).toBe(202);

    expect(await textsOf(paul, value.external_id)).toEqual([expected]);
  });

  it('l’envoi répété ne double rien, et le premier statut reste ; deux blocs de même id n’en font qu’un', async () => {
    const { paul, paulToken } = await setup();
    const first = body([appel({ statut: 'sans_resultat' }), appel({ statut: 'erreur' })]);

    expect((await post(paulToken, first)).status).toBe(202);
    expect((await post(paulToken, { ...first, blocs: [appel(), raisonnement()] })).status).toBe(
      202,
    );

    expect(await textsOf(paul, first.external_id)).toEqual([
      'Je lis le fichier avant de le changer.',
      'Read · src/a.ts · sans_resultat',
    ]);
    // Le second envoi n'a indexé que son tour neuf.
    expect(enqueuePipelineStep).toHaveBeenCalledTimes(2);
  });

  it('un envoi sans tour neuf ne met rien en file', async () => {
    const { paulToken } = await setup();
    const value = body([raisonnement()]);
    await post(paulToken, value);

    expect((await post(paulToken, value)).status).toBe(202);

    expect(enqueuePipelineStep).toHaveBeenCalledTimes(1);
  });

  it('ne fait pas avancer last_turn_at : une coulisse n’est pas un tour de la conversation', async () => {
    const { paul, paulToken } = await setup();
    const value = body([raisonnement({ ts: '2026-11-12T12:00:00+01:00' })]);
    const lastTurnAt = new Date('2026-11-12T09:00:00Z');
    await adminDb.insert(sources).values({
      tenantId: paul.tenantId,
      kind: 'claude_code',
      externalId: value.external_id,
      ownerUserId: paul.userId,
      acl: [paul.userId],
      lastTurnAt,
    });

    expect((await post(paulToken, value)).status).toBe(202);

    const [source] = await adminDb
      .select({ lastTurnAt: sources.lastTurnAt })
      .from(sources)
      .where(and(eq(sources.ownerUserId, paul.userId), eq(sources.externalId, value.external_id)));
    expect(source?.lastTurnAt).toEqual(lastTurnAt);
  });

  it('compte les blocs et les octets reçus par rôle, sans texte ni identifiant', async () => {
    const { paulToken } = await setup();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const blocs = [raisonnement(), raisonnement({ id: 'ligne-2' }), appel()];
    const value = body(blocs);

    expect((await post(paulToken, value)).status).toBe(202);

    const octets = (bloc: unknown) => Buffer.byteLength(JSON.stringify(bloc));
    const lines = info.mock.calls.filter(
      ([prefix, event]) => prefix === '[leon]' && String(event).startsWith('coulisses.'),
    );
    expect(lines).toEqual([
      [
        '[leon]',
        'coulisses.raisonnement',
        { blocs: 2, octets: octets(blocs[0]) + octets(blocs[1]) },
      ],
      ['[leon]', 'coulisses.appel_outil', { blocs: 1, octets: octets(blocs[2]) }],
    ]);
    expect(JSON.stringify(lines)).not.toContain(value.external_id);
    expect(JSON.stringify(lines)).not.toContain('Je lis');
  });

  it('ne compte rien pour un envoi refusé', async () => {
    const { paulToken } = await setup();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect((await post(paulToken, body([raisonnement()], { usages: [] }))).status).toBe(403);

    expect(info.mock.calls.filter(([, event]) => String(event).startsWith('coulisses.'))).toEqual(
      [],
    );
  });
});

// Le retrait daté (décision 5 d'Amos pour le lot 14, C10) : la règle des faits. Après un retrait de l'outil sur ce jeton,
// un envoi sans `accord_le`, ou sous un accord qui ne lui est pas postérieur, reçoit 403 et n'écrit rien. Les coulisses
// déjà rangées restent.
describe('le retrait daté', () => {
  const RETIRE_LE = '2026-11-10T10:00:00.000Z';
  const withdraw = (token: string, outil = 'claude_code') =>
    apiRequest(API_PATHS.retrait, { token, body: { outil, retire_le: RETIRE_LE } });

  it.each([
    ['aucune date d’accord', {}],
    ['un accord plus ancien', { accord_le: '2026-11-10T09:00:00.000Z' }],
    ['un accord de la même milliseconde', { accord_le: RETIRE_LE }],
  ])('après un retrait, un envoi avec %s reçoit 403 et n’écrit rien', async (_, extra) => {
    const { paul, paulToken } = await setup();
    const kept = body([raisonnement()]);
    expect((await post(paulToken, kept)).status).toBe(202);
    expect((await withdraw(paulToken)).status).toBe(204);
    vi.mocked(enqueuePipelineStep).mockReset();

    const response = await post(paulToken, { ...kept, blocs: [appel()], ...extra });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Backstage not allowed' });
    // Les coulisses déjà rangées restent, rien de neuf.
    expect(await textsOf(paul, kept.external_id)).toEqual([
      'Je lis le fichier avant de le changer.',
    ]);
    expect(enqueuePipelineStep).not.toHaveBeenCalled();
  });

  it('un accord postérieur au retrait rouvre l’envoi', async () => {
    const { paul, paulToken } = await setup();
    await withdraw(paulToken);
    const value = body([raisonnement()], { accord_le: '2026-11-10T11:00:00.000Z' });

    expect((await post(paulToken, value)).status).toBe(202);

    expect(await textsOf(paul, value.external_id)).toHaveLength(1);
  });

  it('le retrait d’un autre outil ne touche pas cet envoi', async () => {
    const { paul, paulToken } = await setup();
    await withdraw(paulToken, 'codex');
    const value = body([raisonnement()]);

    expect((await post(paulToken, value)).status).toBe(202);

    expect(await textsOf(paul, value.external_id)).toHaveLength(1);
  });
});
