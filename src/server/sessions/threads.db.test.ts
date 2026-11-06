import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { recordFacts } from '@/server/ingest/record-facts';
import { listVersions, writeVersion } from '@/server/memory/versions';
import { adminDb } from '@/test/db';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import type { ThreadJob } from './threads-queue';

// Le rangement des sessions en fils (T40 ; D21, D22 et D34 du plan de la mémoire à disposition), sur la base de test.
// Les files sont simulées (threads-queue.db.test.ts vérifie les vraies) : les fils mis en file `fil-maj` sont notés.

const mocks = vi.hoisted(() => ({ enqueueFilMaj: vi.fn(), work: vi.fn() }));
vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  enqueueFilMaj: mocks.enqueueFilMaj,
  getThreadsBoss: async () => ({ work: mocks.work }),
}));

const { fileSession, startThreadsWorker } = await import('./threads');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];

beforeEach(() => {
  mocks.enqueueFilMaj.mockReset();
  mocks.enqueueFilMaj.mockResolvedValue(undefined);
});
afterAll(() => dropTeams(tenantIds));

async function team(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const { members: list } = await newTeam(['Paul', 'Marie'], tenantIds);
  const [paul, marie] = list as [TenantContext, TenantContext];
  return { paul, marie };
}

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/fils',
  prs: [],
  commits: [],
  fichiers: ['src/server/sessions/threads.ts'],
  commandes: [],
  taches: [],
  erreurs: 0,
  externe: false,
  echanges: 3,
  debut: '2026-11-06T09:00:00.000Z',
  fin: '2026-11-06T10:00:00.000Z',
  ...extra,
});

// Une session de code, rangée comme par la route des faits.
async function session(
  owner: TenantContext,
  extra: Partial<SessionFacts> = {},
  externalId = `session-${randomUUID()}`,
): Promise<string> {
  const { sourceId } = await recordFacts(owner, {
    kind: 'claude_code',
    external_id: externalId,
    project: PROJECT,
    accord: 2,
    faits: facts(extra),
    fin: true,
  });
  return sourceId;
}

const jobOf = (owner: TenantContext, sourceId: string): ThreadJob => ({
  tenantId: owner.tenantId,
  sourceId,
  ownerUserId: owner.userId,
});
const file = (owner: TenantContext, sourceId: string) => fileSession(jobOf(owner, sourceId));

type Fil = { id: string; externalId: string; acl: string[]; metadata: Record<string, unknown> };

// Les fils de ce membre, lus hors RLS, du plus ancien au plus récent.
async function filsOf(owner: TenantContext): Promise<Fil[]> {
  const rows = await adminDb
    .select({
      id: sources.id,
      externalId: sources.externalId,
      acl: sources.acl,
      metadata: sources.metadata,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(
      and(
        eq(sources.tenantId, owner.tenantId),
        eq(sources.ownerUserId, owner.userId),
        eq(sources.kind, 'leon_fil'),
      ),
    );
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map(({ createdAt: _, ...fil }) => fil);
}
const kept = async (owner: TenantContext) =>
  (await filsOf(owner)).filter((fil) => fil.metadata.absorbe_par === undefined);
const sessionIds = (fil: Fil | undefined) =>
  (fil?.metadata.sessions as Array<{ id: string }> | undefined)?.map((entry) => entry.id).sort();

describe('fileSession', () => {
  it('même branche, même fil, privé à son auteur, sans la branche dans son identifiant', async () => {
    const { paul } = await team();
    const first = await session(paul);
    const second = await session(paul);

    expect(await file(paul, first)).toBe('range');
    expect(await file(paul, second)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    const [fil] = fils;
    expect(fil?.acl).toEqual([paul.userId]);
    expect(fil?.externalId).toMatch(/^leon:fil:github\.com\/acme\/leon:[0-9a-f]{32}$/);
    expect(fil?.externalId).not.toContain('paul/fils');
    expect(fil?.metadata).toMatchObject({
      project: PROJECT,
      branches: ['paul/fils'],
      prs: [],
      fichiers: ['src/server/sessions/threads.ts'],
      absorbes: [],
    });
    expect(sessionIds(fil)).toEqual([first, second].sort());
    expect(fil?.metadata.sessions).toContainEqual({
      id: first,
      kind: 'claude_code',
      date: expect.any(String),
    });
    expect(typeof fil?.metadata.maj_le).toBe('string');
    // Chaque changement met le fil en file `fil-maj` (T43), jamais la session.
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([
      [jobOf(paul, fil?.id ?? '')],
      [jobOf(paul, fil?.id ?? '')],
    ]);
  });

  it('sur main ou master, sans PR : hors fil, aucun fil ouvert', async () => {
    const { paul } = await team();
    const onMain = await session(paul, { branche: 'main' });
    const onMaster = await session(paul, { branche: 'master' });
    const detached = await session(paul, { branche: null });

    expect(await file(paul, onMain)).toBe('hors-fil');
    expect(await file(paul, onMaster)).toBe('hors-fil');
    expect(await file(paul, detached)).toBe('hors-fil');
    expect(await filsOf(paul)).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('une session sans branche rejoint le fil d’une de ses PR', async () => {
    const { paul } = await team();
    const onBranch = await session(paul, {
      prs: [{ repo: 'acme/leon', numero: 140, par: 'pr-link' }],
    });
    const onMain = await session(paul, {
      branche: 'main',
      prs: [{ repo: 'Acme/Leon', numero: 140, par: 'gh-pr-create' }],
    });

    await file(paul, onBranch);
    expect(await file(paul, onMain)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([onBranch, onMain].sort());
    expect(fils[0]?.metadata.prs).toEqual([{ repo: 'acme/leon', numero: 140 }]);
  });

  it('une session sans branche dont aucun fil n’a la PR ouvre le fil de cette PR', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 141, par: 'pr-link' } as const;
    const first = await session(paul, { branche: null, prs: [pr] });
    const second = await session(paul, { branche: 'main', prs: [pr] });

    await file(paul, first);
    await file(paul, second);

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(fils[0]?.externalId).toMatch(/^leon:fil:github\.com\/acme\/leon:[0-9a-f-]{36}$/);
    expect(fils[0]?.metadata.branches).toEqual([]);
    expect(sessionIds(fils[0])).toEqual([first, second].sort());
  });

  it('même PR sur deux branches : fusion, un seul fil rendu, l’absorbé gardé et marqué', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 110, par: 'pr-link' } as const;
    const onA = await session(paul, { branche: 'paul/a', prs: [pr] });
    const onB = await session(paul, {
      branche: 'paul/b',
      prs: [pr],
      fichiers: ['src/server/sessions/threads-queue.ts'],
    });

    await file(paul, onA);
    mocks.enqueueFilMaj.mockClear();
    expect(await file(paul, onB)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(2);
    const [keeper, absorbed] = fils;
    // Le plus ancien est gardé ; l'autre reste, marqué, avec ce qu'il avait.
    expect(await kept(paul)).toEqual([keeper]);
    expect(absorbed?.metadata.absorbe_par).toBe(keeper?.id);
    expect(absorbed?.metadata.branches).toEqual(['paul/b']);
    expect(keeper?.metadata.absorbes).toEqual([absorbed?.id]);
    expect(keeper?.metadata.branches).toEqual(['paul/a', 'paul/b']);
    expect(keeper?.metadata.prs).toEqual([{ repo: 'acme/leon', numero: 110 }]);
    expect(keeper?.metadata.fichiers).toEqual([
      'src/server/sessions/threads.ts',
      'src/server/sessions/threads-queue.ts',
    ]);
    expect(sessionIds(keeper)).toEqual([onA, onB].sort());
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([[jobOf(paul, keeper?.id ?? '')]]);
  });

  it('après une fusion, l’historique des deux fils reste lisible, aucune version n’est supprimée, et une session de plus rejoint le fil gardé', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 120, par: 'pr-link' } as const;
    await file(paul, await session(paul, { branche: 'paul/a', prs: [pr] }));
    await file(paul, await session(paul, { branche: 'paul/b' }));
    const [filA, filB] = await filsOf(paul);
    for (const fil of [filA, filB]) {
      await withTenant(paul, (tx) =>
        writeVersion(tx, paul, {
          sourceId: fil?.id ?? '',
          attendue: 0,
          texte: 'Liste du serveur.',
          entrees: [],
          ecritPar: 'serveur',
          motif: 'rangement',
        }),
      );
    }
    const versions = () =>
      adminDb
        .select({ id: versionsMemoire.id })
        .from(versionsMemoire)
        .where(inArray(versionsMemoire.sourceId, [filA?.id ?? '', filB?.id ?? '']));
    expect(await versions()).toHaveLength(2);

    // Une session de la branche b avec la PR du fil a : les deux fils fusionnent.
    await file(paul, await session(paul, { branche: 'paul/b', prs: [pr] }));

    expect(await kept(paul)).toHaveLength(1);
    expect(await versions()).toHaveLength(2);
    expect((await listVersions(paul, filA?.id ?? '')).map((version) => version.n)).toEqual([1]);
    expect((await listVersions(paul, filB?.id ?? '')).map((version) => version.n)).toEqual([1]);

    // Une session de plus sur la branche du fil absorbé rejoint le fil gardé.
    const later = await session(paul, { branche: 'paul/b' });
    expect(await file(paul, later)).toBe('range');
    const [keeper, absorbed] = await filsOf(paul);
    expect(keeper?.id).toBe(filA?.id);
    expect(sessionIds(keeper)).toContain(later);
    expect(sessionIds(absorbed)).not.toContain(later);
    expect(await filsOf(paul)).toHaveLength(2);
  });

  it('une session de collègue partagée avec moi n’entre jamais dans mon fil', async () => {
    const { paul, marie } = await team();
    await file(paul, await session(paul));
    const theirs = await session(marie);
    // Partagée avec toute l'équipe : la RLS la montre à Paul, seul le filtre de l'auteur la refuse.
    await adminDb
      .update(sources)
      .set({ acl: [marie.tenantId] })
      .where(eq(sources.id, theirs));

    expect(await file(paul, theirs)).toBe('sans-objet');
    expect(await file(marie, theirs)).toBe('range');

    const [mine] = await filsOf(paul);
    expect(sessionIds(mine)).not.toContain(theirs);
    expect(await filsOf(paul)).toHaveLength(1);
    const [hers] = await filsOf(marie);
    expect(sessionIds(hers)).toEqual([theirs]);
    expect(hers?.acl).toEqual([marie.userId]);
  });

  it('envoi répété : rien en double, et le fil inchangé n’est pas remis en file', async () => {
    const { paul } = await team();
    const externalId = `session-${randomUUID()}`;
    const sourceId = await session(paul, {}, externalId);
    expect(await file(paul, sourceId)).toBe('range');

    expect(await session(paul, {}, externalId)).toBe(sourceId);
    expect(await file(paul, sourceId)).toBe('inchange');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([sourceId]);
    expect(fils[0]?.metadata.fichiers).toEqual(['src/server/sessions/threads.ts']);
    expect(mocks.enqueueFilMaj).toHaveBeenCalledTimes(1);
  });

  it('quatre sessions sur la même branche, faits reçus au même moment : un seul fil, aucune session perdue', async () => {
    const { paul } = await team();
    const ids = await Promise.all([1, 2, 3, 4].map(() => session(paul)));

    await Promise.all(ids.map((id) => file(paul, id)));

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([...ids].sort());
  });

  it('deux branches qui partagent une PR, rangées au même moment : un seul fil gardé, aucune session perdue', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 130, par: 'pr-link' } as const;
    const ids = await Promise.all(
      ['paul/c', 'paul/d', 'paul/e'].map((branche) => session(paul, { branche, prs: [pr] })),
    );

    await Promise.all(ids.map((id) => file(paul, id)));

    const fils = await kept(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([...ids].sort());
    expect([...((fils[0]?.metadata.branches ?? []) as string[])].sort()).toEqual([
      'paul/c',
      'paul/d',
      'paul/e',
    ]);
  });

  it('l’auteur parti de l’organisation : rien n’est rangé', async () => {
    const { paul } = await team();
    const sourceId = await session(paul);
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    expect(await file(paul, sourceId)).toBe('sans-objet');
    expect(await filsOf(paul)).toEqual([]);
  });
});

describe('startThreadsWorker', () => {
  it('range la session du job, et ses journaux ne citent que des uuid', async () => {
    const { paul } = await team();
    const sourceId = await session(paul, {
      branche: 'paul/branche-secrete',
      fichiers: ['src/fichier-secret.ts'],
    });
    mocks.work.mockResolvedValue('worker-id');
    mocks.enqueueFilMaj.mockRejectedValue(new Error('pg-boss en panne'));
    const logs = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];

    await startThreadsWorker();
    const handler = mocks.work.mock.calls[0]?.at(-1) as (
      jobs: Array<{ data: unknown }>,
    ) => Promise<void>;
    await handler([{ data: jobOf(paul, sourceId) }]);

    expect(await filsOf(paul)).toHaveLength(1);
    const written = logs.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    for (const spy of logs) spy.mockRestore();
    expect(written).toContain('threads.fil_maj_enqueue');
    expect(written).not.toContain('branche-secrete');
    expect(written).not.toContain('fichier-secret');
  });
});
