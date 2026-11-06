import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFacts } from '@/capture/session-facts';
import type { SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { removeConnectorItems } from '@/server/connectors/ingest-items';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { addDocument, deleteDocument, deleteFolder } from '@/server/documents/documents';
import type { Embedder } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { createIngestRun, insertNewTurns } from '@/server/ingest/ingest-turns';
import { recordFacts } from '@/server/ingest/record-facts';
import { listVersions, readLatest, readVersion, writeVersion } from '@/server/memory/versions';
import type { PipelineJob } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { searchPassages } from '@/server/search/search';
import { adminDb, adminPool } from '@/test/db';
import { seedConnection } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import type { ThreadJob } from './threads-queue';

// Relier les connecteurs et GitHub aux fils (T42 ; D21, D22, D34 et D35 du plan de la mémoire à disposition), sur la
// base de test. Les files sont simulées (threads-queue.db.test.ts vérifie les vraies) : les fils mis en file `fil-maj`
// et les sources mises à relier sont notés. Les vecteurs viennent du fournisseur factice.

const mocks = vi.hoisted(() => ({
  enqueueFilMaj: vi.fn(),
  enqueueRangement: vi.fn(),
  enqueueLiaison: vi.fn(),
  enqueuePipelineStep: vi.fn(),
  work: vi.fn(),
}));
// L'envoi d'un document met en file son indexation : le test la lance à la main.
vi.mock('@/server/pipeline/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/pipeline/queue')>()),
  enqueuePipelineStep: mocks.enqueuePipelineStep,
}));
vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  enqueueFilMaj: mocks.enqueueFilMaj,
  enqueueRangement: mocks.enqueueRangement,
  enqueueLiaison: mocks.enqueueLiaison,
  getThreadsBoss: async () => ({ work: mocks.work }),
}));

const { fileSession } = await import('./threads');
const { linkSource, startThreadLinksWorker } = await import('./thread-links');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
const factice = createFakeEmbedder();

beforeEach(() => {
  for (const mock of [
    mocks.enqueueFilMaj,
    mocks.enqueueRangement,
    mocks.enqueueLiaison,
    mocks.enqueuePipelineStep,
  ]) {
    mock.mockReset();
    mock.mockResolvedValue(undefined);
  }
});
afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await dropTeams(tenantIds);
});

async function team(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const { members: list } = await newTeam(['Paul', 'Marie'], tenantIds);
  const [paul, marie] = list as [TenantContext, TenantContext];
  return { paul, marie };
}

const jobOf = (owner: TenantContext, sourceId: string): ThreadJob => ({
  tenantId: owner.tenantId,
  sourceId,
  ownerUserId: owner.userId,
});

// Une session de code de Claude Code, ses faits reçus.
async function sessionOf(
  owner: TenantContext,
  extra: Partial<SessionFacts> = {},
  externalId = `session-${randomUUID()}`,
): Promise<string> {
  const { sourceId } = await recordFacts(owner, {
    kind: 'claude_code',
    external_id: externalId,
    project: PROJECT,
    accord: 2,
    faits: {
      branche: 'paul/fils',
      prs: [],
      commits: [],
      fichiers: ['src/server/sessions/thread-links.ts'],
      commandes: [],
      taches: [],
      erreurs: 0,
      externe: false,
      echanges: 3,
      debut: '2026-11-06T09:00:00.000Z',
      fin: '2026-11-06T10:00:00.000Z',
      ...extra,
    },
    fin: true,
  });
  return sourceId;
}

// Une session rangée dans son fil comme par le worker du rangement.
async function filed(
  owner: TenantContext,
  extra: Partial<SessionFacts> = {},
  externalId?: string,
): Promise<string> {
  const sourceId = await sessionOf(owner, extra, externalId);
  await fileSession(jobOf(owner, sourceId), { embedder: factice });
  return sourceId;
}

// Le résumé de la session (un tour `leon:resume:1` et son run, avec l'usage `resume`), indexé avec le fournisseur
// factice, comme dans threads.db.test.ts.
async function summarize(owner: TenantContext, sourceId: string, text: string): Promise<void> {
  const ingestRunId = await withTenant(owner, async (tx) => {
    await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || '{"resume": {"tour": 1}, "usages": ["resume"]}'::jsonb`,
      })
      .where(eq(sources.id, sourceId));
    const { ids } = await insertNewTurns(tx, [
      {
        tenantId: owner.tenantId,
        sourceId,
        externalId: 'leon:resume:1',
        role: 'document',
        text,
        ts: new Date(),
        captureMode: 'manual',
        acl: [owner.userId],
      },
    ]);
    return createIngestRun(tx, owner, sourceId, ids, [owner.userId]);
  });
  const job = { ingestRunId, tenantId: owner.tenantId, userId: owner.userId };
  expect(await indexIngestRun(job, { embedder: factice })).toBe('indexe');
}

// Un élément d'un outil, comme l'écrit l'ingestion des connecteurs (son titre, sa nature, son origine, ses tours),
// visible de l'équipe par défaut, puis indexé comme par le worker de la recherche.
async function item(
  owner: TenantContext,
  input: {
    kind: SourceKind;
    title: string;
    texts: string[];
    externalId?: string;
    origin?: Record<string, string>;
    acl?: string[];
    role?: 'document' | 'participant' | 'user';
  },
  embedder: Embedder | null = factice,
): Promise<string> {
  const { job, sourceId } = await seedRun(owner, {
    kind: input.kind,
    externalId: input.externalId,
    title: input.title,
    acl: input.acl ?? [owner.tenantId],
    metadata: { nature: 'ticket', ...(input.origin ? { origin: input.origin } : {}) },
    turns: input.texts.map((text) => ({ text, role: input.role ?? 'participant' })),
  });
  expect(await indexIngestRun(job, { embedder })).toBe('indexe');
  return sourceId;
}

// Une PR GitHub de la branche `branche`, sur le dépôt du projet, poussée par l'équipe (pas un fork).
const pr = (owner: TenantContext, numero: number, branche: string, title: string) =>
  item(owner, {
    kind: 'github',
    externalId: `pr:Acme/Leon#${numero}`,
    title: `#${numero} ${title}`,
    origin: { repo: 'Acme/Leon', etat: 'open', cote: 'equipe', branche, tete: 'Acme/Leon' },
    texts: ['Corps de la PR.'],
    role: 'document',
  });

const link = (indexer: TenantContext, sourceId: string, embedder: Embedder | null = factice) =>
  linkSource(jobOf(indexer, sourceId), { embedder });

// Un document envoyé par le site, indexé comme par le worker de la recherche ; rend sa source.
async function upload(
  owner: TenantContext,
  name: string,
  text: string,
  folder?: { id: string; name: string; path: string },
): Promise<string> {
  await addDocument(owner, new File([text], name), folder);
  const job = mocks.enqueuePipelineStep.mock.lastCall?.[1] as PipelineJob;
  expect(await indexIngestRun(job, { embedder: factice })).toBe('indexe');
  const { rows } = await adminPool.query('select source_id from ingest_runs where id = $1', [
    job.ingestRunId,
  ]);
  return rows[0].source_id as string;
}

// Le temps qu'une transaction lancée atteigne le verrou que le test retient, comme dans delete-account.db.test.ts.
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));

type Fil = { id: string; metadata: Record<string, unknown> };

// Les fils gardés (non absorbés) de ce membre, lus hors RLS, du plus ancien au plus récent.
async function kept(owner: TenantContext): Promise<Fil[]> {
  const rows = await adminDb
    .select({ id: sources.id, metadata: sources.metadata, createdAt: sources.createdAt })
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
    .map(({ id, metadata }) => ({ id, metadata: metadata as Record<string, unknown> }))
    .filter((fil) => fil.metadata.absorbe_par === undefined);
}
async function onlyFil(owner: TenantContext): Promise<Fil> {
  const fils = await kept(owner);
  expect(fils).toHaveLength(1);
  return fils[0] as Fil;
}

// L'ordre de deux sources reliées au même moment suit leurs ids.
const byId = (list: unknown) =>
  [...(list as Array<{ id: string }>)].sort((a, b) => a.id.localeCompare(b.id));

const NEAR = 'Rangement des fils de travail par la proximité des résumés de session';

describe('linkSource, par clé exacte', () => {
  it('une PR de la branche du fil s’y relie, et le ticket ABC-123 cité dans son titre relie le ticket', async () => {
    const { paul } = await team();
    await filed(paul);
    // Le ticket est relevé d'abord, sans vecteur : aucun fil n'a encore ce ticket.
    const ticket = await item(
      paul,
      { kind: 'linear', title: 'ABC-123 Ranger les fils', texts: ['Le ticket.'] },
      null,
    );
    // La fin de l'indexation l'a mis à relier, même sans vecteur.
    expect(mocks.enqueueLiaison).toHaveBeenCalledWith(jobOf(paul, ticket));
    expect(await link(paul, ticket)).toEqual([]);
    const pull = await pr(paul, 140, 'paul/fils', 'ABC-123 Ranger les fils');
    const { id } = await onlyFil(paul);
    mocks.enqueueFilMaj.mockClear();

    expect(await link(paul, pull)).toEqual([id]);

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([
      { id: pull, cle: 'branche' },
      { id: ticket, cle: 'ticket' },
    ]);
    expect(metadata.tickets).toEqual(['ABC-123']);
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([[jobOf(paul, id)]]);
    // Relancée : rien ne change, rien ne part en file.
    expect(await link(paul, pull)).toEqual([]);
    expect(await link(paul, ticket)).toEqual([]);
    expect(mocks.enqueueFilMaj).toHaveBeenCalledTimes(1);
  });

  it('une PR et un ticket relevés avant la session rejoignent le fil quand la session est rangée', async () => {
    const { paul } = await team();
    const pull = await pr(paul, 141, 'paul/abc-77-fils', 'Les fils');
    const ticket = await item(paul, {
      kind: 'jira',
      title: 'ABC-77 Les fils',
      texts: ['Le ticket.'],
    });
    // Une PR d'un fork, de même branche, n'est jamais reliée par sa branche.
    const fork = await item(paul, {
      kind: 'github',
      externalId: 'pr:Acme/Leon#142',
      title: '#142 Les fils',
      origin: { repo: 'Acme/Leon', cote: 'exterieur', branche: 'paul/abc-77-fils', tete: 'x/leon' },
      texts: ['Corps de la PR.'],
      role: 'document',
    });
    expect(await link(paul, pull)).toEqual([]);

    await filed(paul, { branche: 'paul/abc-77-fils' });
    const { id } = await onlyFil(paul);
    // Le rangement met le fil à relier.
    expect(mocks.enqueueLiaison).toHaveBeenCalledWith(jobOf(paul, id));

    expect(await link(paul, id)).toEqual([id]);

    const { metadata } = await onlyFil(paul);
    expect(byId(metadata.liees)).toEqual(
      byId([
        { id: pull, cle: 'branche' },
        { id: ticket, cle: 'ticket' },
      ]),
    );
    expect(metadata.liees).not.toContainEqual(expect.objectContaining({ id: fork }));
    expect(metadata.tickets).toEqual(['ABC-77']);
    expect(await link(paul, id)).toEqual([]);
  });

  it('un message Slack qui cite l’URL d’une PR ou la branche rejoint son fil, sans copie de son texte, et ses mots sont rangés avec son id', async () => {
    const { paul, marie } = await team();
    await filed(paul, { prs: [{ repo: 'acme/leon', numero: 143, par: 'gh-pr-create' }] });
    const byUrl = await item(marie, {
      kind: 'slack',
      title: '#dev, 06/11/2026',
      texts: ['Peux-tu relire https://github.com/Acme/Leon/pull/143 ? Le staging change demain.'],
    });
    const byBranch = await item(marie, {
      kind: 'slack',
      title: '#produit, 06/11/2026',
      texts: ['J’ai poussé sur paul/fils ce matin.'],
    });
    const other = await item(marie, {
      kind: 'slack',
      title: '#autre, 06/11/2026',
      texts: ['Rien à voir : paul/fils-2 et https://github.com/acme/leon/pull/1430.'],
    });
    const { id } = await onlyFil(paul);

    expect(await link(marie, byUrl)).toEqual([id]);
    expect(await link(marie, byBranch)).toEqual([id]);
    expect(await link(marie, other)).toEqual([]);

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([
      { id: byUrl, cle: 'lien' },
      { id: byBranch, cle: 'lien' },
    ]);
    expect(metadata.mots_cles).toEqual([
      { id: byUrl, mots: 'dev 06 11 2026' },
      { id: byBranch, mots: 'produit 06 11 2026' },
    ]);
    // Des ids et des clés, jamais le texte d'un message.
    const stored = JSON.stringify(metadata);
    expect(stored).not.toContain('staging');
    expect(stored).not.toContain('poussé');
    expect(await kept(marie)).toEqual([]);
  });

  it('une source d’un autre membre, invisible de l’auteur, n’est jamais reliée', async () => {
    const { paul, marie } = await team();
    const session = await filed(paul, {
      prs: [{ repo: 'acme/leon', numero: 144, par: 'gh-pr-create' }],
    });
    await summarize(paul, session, NEAR);
    const message = await item(marie, {
      kind: 'slack',
      title: '#prive, 06/11/2026',
      texts: ['https://github.com/acme/leon/pull/144'],
      acl: [marie.userId],
    });
    const note = await item(marie, {
      kind: 'mcp_remember',
      title: NEAR,
      texts: [`${NEAR}, suite`],
      acl: [marie.userId],
      role: 'user',
    });
    mocks.enqueueFilMaj.mockClear();

    expect(await link(marie, message)).toEqual([]);
    expect(await link(marie, note)).toEqual([]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('une note ou une conversation d’une collègue n’entre jamais dans mon fil, même visible de moi', async () => {
    const { paul, marie } = await team();
    const session = await filed(paul);
    await summarize(paul, session, NEAR);
    const note = await item(marie, {
      kind: 'mcp_remember',
      title: NEAR,
      texts: [`${NEAR}, à retenir`],
      acl: [marie.tenantId],
      role: 'user',
    });
    const conversation = await item(marie, {
      kind: 'claude_ai',
      title: 'Les fils',
      texts: [`${NEAR}, en conversation`],
      acl: [marie.userId, paul.userId],
      role: 'user',
    });
    const { id } = await onlyFil(paul);
    mocks.enqueueFilMaj.mockClear();

    expect(await link(marie, note)).toEqual([]);
    expect(await link(marie, conversation)).toEqual([]);
    // Ni depuis le fil, par la proximité de son résumé.
    expect(await link(paul, id)).toEqual([]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('un message relevé avant que le fil ait la branche ou la PR qu’il cite le rejoint quand le fil la prend', async () => {
    const { paul, marie } = await team();
    const byBranch = await item(marie, {
      kind: 'slack',
      title: '#produit, 06/11/2026',
      texts: ['Je reprends paul/fils-neuf demain.'],
    });
    const byUrl = await item(marie, {
      kind: 'slack',
      title: '#dev, 06/11/2026',
      texts: ['Relis https://github.com/Acme/Leon/pull/151 avant demain.'],
    });
    // Aucun fil n'a encore ces clés.
    expect(await link(marie, byBranch)).toEqual([]);
    expect(await link(marie, byUrl)).toEqual([]);
    const externalId = `session-${randomUUID()}`;
    await filed(paul, { branche: 'paul/fils-neuf' }, externalId);
    const { id } = await onlyFil(paul);

    expect(await link(paul, id)).toEqual([id]);
    expect((await onlyFil(paul)).metadata.liees).toEqual([{ id: byBranch, cle: 'lien' }]);

    // La session ouvre ensuite sa PR : le fil prend la clé, et le rangement le met à relier.
    await filed(
      paul,
      { branche: 'paul/fils-neuf', prs: [{ repo: 'acme/leon', numero: 151, par: 'gh-pr-create' }] },
      externalId,
    );
    expect(mocks.enqueueLiaison).toHaveBeenLastCalledWith(jobOf(paul, id));
    expect(await link(paul, id)).toEqual([id]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([
      { id: byBranch, cle: 'lien' },
      { id: byUrl, cle: 'lien' },
    ]);
  });
});

describe('linkSource, par proximité', () => {
  it('une réunion proche rejoint le fil ; une réunion lointaine, ou sans fournisseur de vecteurs, non', async () => {
    const { paul } = await team();
    const session = await filed(paul);
    await summarize(paul, session, NEAR);
    // Les vecteurs de son résumé écrits, la session est remise à relier : ses fils, par proximité.
    expect(mocks.enqueueLiaison).toHaveBeenCalledWith(jobOf(paul, session));
    const meeting = await item(paul, {
      kind: 'granola',
      title: 'Point du jeudi',
      texts: [`${NEAR}, vue en réunion`],
    });
    // Les vecteurs de la réunion écrits, elle a été mise à relier.
    expect(mocks.enqueueLiaison).toHaveBeenCalledWith(jobOf(paul, meeting));
    const far = await item(paul, {
      kind: 'granola',
      title: 'Déjeuner',
      texts: ['Une recette de crêpes bretonnes au sarrasin'],
    });
    const { id } = await onlyFil(paul);

    expect(await link(paul, far)).toEqual([]);
    expect(await link(paul, meeting, null)).toEqual([]);
    expect(await link(paul, meeting)).toEqual([id]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([{ id: meeting, cle: 'proximite' }]);
  });

  it('une note remember proche rejoint le fil, sans ses mots ; une note ne se relie jamais par clé', async () => {
    const { paul } = await team();
    // La branche porte le ticket ABC-9.
    const session = await filed(paul, {
      branche: 'paul/abc-9-x',
      prs: [{ repo: 'acme/leon', numero: 145, par: 'gh-pr-create' }],
    });
    await summarize(paul, session, NEAR);
    // Le titre d'une note est le début de son texte (remember-tool.ts).
    const note = await item(paul, {
      kind: 'mcp_remember',
      title: 'Note sur le rangement',
      texts: [`${NEAR}, à retenir`],
      acl: [paul.userId],
      role: 'user',
    });
    const byKey = await item(paul, {
      kind: 'mcp_remember',
      title: 'Lien',
      texts: ['https://github.com/acme/leon/pull/145'],
      acl: [paul.userId],
      role: 'user',
    });
    const byTicket = await item(paul, {
      kind: 'mcp_remember',
      title: 'ABC-9 à reprendre',
      texts: ['Une recette de crêpes bretonnes au sarrasin'],
      acl: [paul.userId],
      role: 'user',
    });
    const { id } = await onlyFil(paul);

    expect(await link(paul, note)).toEqual([id]);
    expect(await link(paul, byKey)).toEqual([]);
    expect(await link(paul, byTicket)).toEqual([]);

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([{ id: note, cle: 'proximite' }]);
    expect(metadata.mots_cles).toEqual([]);
  });

  it('une note écrite avant le premier résumé du fil le rejoint quand les vecteurs du résumé sont écrits', async () => {
    const { paul } = await team();
    const session = await filed(paul);
    const note = await item(paul, {
      kind: 'mcp_remember',
      title: 'Note sur le rangement',
      texts: [`${NEAR}, à retenir`],
      acl: [paul.userId],
      role: 'user',
    });
    // Aucun résumé dans le fil : rien de proche.
    expect(await link(paul, note)).toEqual([]);
    await summarize(paul, session, NEAR);
    // Les vecteurs du résumé écrits, la session est remise à relier.
    expect(mocks.enqueueLiaison).toHaveBeenCalledWith(jobOf(paul, session));
    const { id } = await onlyFil(paul);

    expect(await link(paul, session)).toEqual([id]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([{ id: note, cle: 'proximite' }]);
    expect(await link(paul, session)).toEqual([]);
  });
});

describe('une source liée qui disparaît', () => {
  it('source de connecteur retirée : elle quitte le fil, qui est mis en file, et l’ancien état n’est rendu par aucune lecture', async () => {
    const { paul } = await team();
    const session = await filed(paul, {
      prs: [{ repo: 'acme/leon', numero: 146, par: 'gh-pr-create' }],
    });
    const externalId = `channel:dev:${randomUUID()}`;
    const message = await item(paul, {
      kind: 'slack',
      externalId,
      title: '#dev, 06/11/2026',
      texts: ['Relis https://github.com/acme/leon/pull/146, zorglubrangement.'],
    });
    const { id } = await onlyFil(paul);
    expect(await link(paul, message)).toEqual([id]);
    // L'état écrit d'après le message, comme le fera T43.
    await withTenant(paul, (tx) =>
      writeVersion(tx, paul, {
        sourceId: id,
        attendue: 0,
        texte: 'Relire la PR 146.',
        entrees: [session, message],
        ecritPar: 'serveur',
        motif: 'rangement',
      }),
    );
    expect((await readLatest(paul, id)).version?.n).toBe(1);
    mocks.enqueueFilMaj.mockClear();
    const connection = {
      id: await seedConnection(paul, { provider: 'slack' }),
      provider: 'slack' as const,
      createdBy: paul.userId,
    };

    expect(await removeConnectorItems(paul, connection, [externalId])).toBe(1);

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([]);
    expect(metadata.mots_cles).toEqual([]);
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([[jobOf(paul, id)]]);
    expect(await readLatest(paul, id)).toEqual({ n: 1, version: null });
    expect(await readVersion(paul, id, 1)).toBeNull();
    expect(await listVersions(paul, id)).toEqual([]);
    expect((await searchPassages(paul, { query: 'zorglubrangement' })).hits).toEqual([]);
  });

  it('document supprimé, dossier supprimé ou remplacé : ils quittent le fil, qui est mis en file, et l’ancien état n’est rendu par aucune lecture', async () => {
    const { paul } = await team();
    const session = await filed(paul);
    await summarize(paul, session, NEAR);
    const folderA = { id: randomUUID(), name: 'dossier-a', path: 'notes.md' };
    const folderB = { id: randomUUID(), name: 'dossier-b', path: 'notes.md' };
    const single = await upload(paul, 'rangement.md', `${NEAR}, document`);
    const inFolder = await upload(paul, 'notes.md', `${NEAR}, dossier`, folderA);
    const replaced = await upload(paul, 'notes.md', `${NEAR}, ancien dossier`, folderB);
    const { id } = await onlyFil(paul);
    for (const doc of [single, inFolder, replaced]) expect(await link(paul, doc)).toEqual([id]);
    // Les mots d'un document : son titre.
    expect((await onlyFil(paul)).metadata.mots_cles).toContainEqual({
      id: inFolder,
      mots: 'dossier-a notes.md',
    });
    await withTenant(paul, (tx) =>
      writeVersion(tx, paul, {
        sourceId: id,
        attendue: 0,
        texte: 'Les trois documents.',
        entrees: [session, single, inFolder, replaced],
        ecritPar: 'serveur',
        motif: 'rangement',
      }),
    );
    mocks.enqueueFilMaj.mockClear();

    expect(await deleteDocument(paul, single)).toBe(true);
    expect(await deleteFolder(paul, folderA.id)).toBe(1);
    // Le premier fichier d'un dossier du même nom remplace l'ancien envoi.
    await addDocument(paul, new File(['Nouveau plan.'], 'notes.md'), {
      ...folderB,
      id: randomUUID(),
    });

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([]);
    expect(metadata.mots_cles).toEqual([]);
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([
      [jobOf(paul, id)],
      [jobOf(paul, id)],
      [jobOf(paul, id)],
    ]);
    expect(await readLatest(paul, id)).toEqual({ n: 1, version: null });
    expect(await listVersions(paul, id)).toEqual([]);
  });

  it('source liée rendue privée : l’ancien état n’est rendu par aucune lecture', async () => {
    const { paul, marie } = await team();
    const session = await filed(paul, {
      prs: [{ repo: 'acme/leon', numero: 152, par: 'gh-pr-create' }],
    });
    const message = await item(marie, {
      kind: 'slack',
      title: '#dev, 06/11/2026',
      texts: ['Relis https://github.com/acme/leon/pull/152.'],
    });
    const { id } = await onlyFil(paul);
    expect(await link(marie, message)).toEqual([id]);
    await withTenant(paul, (tx) =>
      writeVersion(tx, paul, {
        sourceId: id,
        attendue: 0,
        texte: 'Relire la PR 152.',
        entrees: [session, message],
        ecritPar: 'serveur',
        motif: 'rangement',
      }),
    );
    expect((await readLatest(paul, id)).version?.n).toBe(1);

    // Rendue privée à Marie, comme 0048 rend privée une PR.
    await adminDb
      .update(sources)
      .set({ acl: [marie.userId] })
      .where(eq(sources.id, message));

    expect(await readLatest(paul, id)).toEqual({ n: 1, version: null });
    expect(await readVersion(paul, id, 1)).toBeNull();
    expect(await listVersions(paul, id)).toEqual([]);
  });
});

describe('la fusion de deux fils', () => {
  it('le fil gardé reprend les sources liées, les tickets et les mots de l’absorbé', async () => {
    const { paul } = await team();
    const shared = { repo: 'acme/leon', numero: 147, par: 'pr-link' } as const;
    await filed(paul, { branche: 'paul/a', prs: [shared] });
    await filed(paul, { branche: 'paul/abc-9-b' });
    const [filA, filB] = await kept(paul);
    const message = await item(paul, {
      kind: 'slack',
      title: '#dev, 06/11/2026',
      texts: ['https://github.com/acme/leon/pull/147'],
    });
    const pull = await pr(paul, 148, 'paul/abc-9-b', 'Branche b');
    expect(await link(paul, message)).toEqual([filA?.id]);
    expect(await link(paul, pull)).toEqual([filB?.id]);

    await filed(paul, { branche: 'paul/abc-9-b', prs: [shared] });

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([
      { id: message, cle: 'lien' },
      { id: pull, cle: 'branche' },
    ]);
    expect(metadata.tickets).toEqual(['ABC-9']);
    expect((metadata.mots_cles as Array<{ id: string }>).map((entry) => entry.id)).toEqual([
      message,
      pull,
    ]);
  });
});

describe('une liaison pendant une fusion', () => {
  it('une source reliée pendant la fusion de son fil n’est pas perdue : le fil gardé la reprend, avec ses mots', async () => {
    const { paul } = await team();
    const shared = { repo: 'acme/leon', numero: 153, par: 'pr-link' } as const;
    const onA = await filed(paul, { branche: 'paul/a', prs: [shared] });
    const onB = await filed(paul, { branche: 'paul/abc-1-b' });
    const [, filB] = await kept(paul);
    const pull = await pr(paul, 154, 'paul/abc-1-b', 'Branche b');
    const merging = await sessionOf(paul, { branche: 'paul/abc-1-b', prs: [shared] });
    // Retient la fusion sur le fil b, pendant que la PR de la branche b se relie.
    const holding = await adminPool.connect();
    try {
      await holding.query('begin');
      await holding.query('select 1 from sources where id = $1 for update', [filB?.id]);
      const filing = fileSession(jobOf(paul, merging), { embedder: factice });
      await pause();
      const linking = link(paul, pull);
      await pause();
      await holding.query('commit');

      expect(await filing).toBe('range');
      await linking;
    } finally {
      await holding.query('rollback');
      holding.release();
    }

    const { metadata } = await onlyFil(paul);
    expect(metadata.liees).toEqual([{ id: pull, cle: 'branche' }]);
    expect((metadata.mots_cles as Array<{ id: string }>).map((entry) => entry.id)).toEqual([pull]);
    expect((metadata.sessions as Array<{ id: string }>).map((entry) => entry.id).sort()).toEqual(
      [onA, onB, merging].sort(),
    );
  });
});

describe('startThreadLinksWorker', () => {
  it('relie la source du job, et ses journaux ne citent que des uuid', async () => {
    const { paul } = await team();
    await filed(paul, { branche: 'paul/branche-secrete' });
    const message = await item(paul, {
      kind: 'slack',
      title: '#canal-secret, 06/11/2026',
      texts: ['Sur paul/branche-secrete.'],
    });
    mocks.work.mockResolvedValue('worker-id');
    mocks.enqueueFilMaj.mockRejectedValue(new Error('pg-boss en panne'));
    const logs = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];

    await startThreadLinksWorker({ embedder: null });
    const handler = mocks.work.mock.calls[0]?.at(-1) as (
      jobs: Array<{ data: unknown }>,
    ) => Promise<void>;
    await handler([{ data: jobOf(paul, message) }]);

    expect((await onlyFil(paul)).metadata.liees).toEqual([{ id: message, cle: 'lien' }]);
    const written = logs.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    for (const spy of logs) spy.mockRestore();
    expect(written).toContain('thread_links.fil_maj_enqueue');
    expect(written).not.toContain('secret');
  });
});
