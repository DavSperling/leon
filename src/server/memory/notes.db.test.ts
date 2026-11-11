import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '@/capture/mask-secrets';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns, versionsMemoire } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { fetchSource } from '@/server/search/context';
import { indexIngestRun } from '@/server/search/index-run';
import { searchPassages } from '@/server/search/search';
import { adminDb } from '@/test/db';
import { seedSource, seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { writeNote } from './notes';
import { restoreVersion } from './versions';

// Les notes de l'agent (T57 ; D33, D34, D38, C12, C14 du plan de la mémoire à disposition) : writeNote est le seul
// chemin qui crée ou réécrit une note. Sa dernière version est aussi son tour indexé ; les anciennes sont hors de la
// recherche et de fetch.

vi.mock('@/server/pipeline/queue');
// L'indexation signale les projets au point du matin : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await newTeam(['Alice', 'Paul'], tenantIds);
  return members as [TenantContext, TenantContext];
}

const stored = (sourceId: string) =>
  adminDb
    .select()
    .from(versionsMemoire)
    .where(eq(versionsMemoire.sourceId, sourceId))
    .orderBy(asc(versionsMemoire.n));
const turnTexts = async (sourceId: string) =>
  (await adminDb.select({ text: turns.text }).from(turns).where(eq(turns.sourceId, sourceId))).map(
    (turn) => turn.text,
  );

// L'indexation que writeNote a mise en file, lancée à la main : le dernier run demandé.
async function indexLast(ctx: TenantContext): Promise<void> {
  const calls = vi.mocked(enqueuePipelineStep).mock.calls;
  const job = calls.at(-1)?.[1] as { ingestRunId: string } | undefined;
  if (!job) throw new Error('aucune indexation en file');
  await indexIngestRun(
    { ingestRunId: job.ingestRunId, tenantId: ctx.tenantId, userId: ctx.userId },
    { embedder: null },
  );
}

async function note(ctx: TenantContext, texte: string, outil = 'claude_code') {
  const written = await writeNote(ctx, { texte, outil, session: 'session-1', projet: PROJECT });
  if (typeof written !== 'object') throw new Error(`note de test non écrite : ${written}`);
  return written;
}

const hits = async (ctx: TenantContext, query: string) =>
  (await searchPassages(ctx, { query })).hits.map((hit) => hit.sourceId);

describe('writeNote : une note neuve', () => {
  it('écrit une source mcp_remember privée à son auteur, avec son outil, sa session et son projet, et sa v1', async () => {
    const [alice, paul] = await pair();

    const written = await note(alice, 'Le cache de Redis tombe le lundi.');

    expect(written).toEqual({ id: expect.any(String), n: 1 });
    const [source] = await adminDb.select().from(sources).where(eq(sources.id, written.id));
    expect(source).toMatchObject({
      kind: 'mcp_remember',
      ownerUserId: alice.userId,
      acl: [alice.userId],
      metadata: { outil: 'claude_code', session: 'session-1', project: PROJECT },
    });
    expect(await stored(written.id)).toMatchObject([
      {
        n: 1,
        texte: 'Le cache de Redis tombe le lundi.',
        ecritPar: 'agent',
        motif: 'note',
        outil: 'claude_code',
        session: 'session-1',
        acl: [alice.userId],
      },
    ]);
    expect(await turnTexts(written.id)).toEqual(['Le cache de Redis tombe le lundi.']);
    expect(enqueuePipelineStep).toHaveBeenCalledWith('index', {
      ingestRunId: expect.any(String),
      tenantId: alice.tenantId,
      userId: alice.userId,
    });
    expect(await fetchSource(paul, written.id)).toBeNull();
  });

  it('range l’outil d’un client MCP sous mcp:<libellé>, sans session ni projet quand ils manquent', async () => {
    const [alice] = await pair();

    const written = await writeNote(alice, { texte: 'Une note.', outil: 'mcp:claude-ai' });

    if (typeof written !== 'object') throw new Error('note non écrite');
    const [source] = await adminDb.select().from(sources).where(eq(sources.id, written.id));
    expect(source?.metadata).toEqual({ outil: 'mcp:claude-ai' });
  });

  it('refuse un outil hors des deux formes, et un texte vide, sans rien écrire', async () => {
    const [alice] = await pair();

    for (const outil of ['github', 'mcp:', 'mcp:Claude AI', `mcp:${'a'.repeat(41)}`, 'leon_fil']) {
      expect(await writeNote(alice, { texte: 'Une note.', outil }), outil).toBe('invalide');
    }
    expect(await writeNote(alice, { texte: '  ', outil: 'codex' })).toBe('invalide');
    expect(
      await writeNote(alice, { texte: 'Une note.', outil: 'codex', projet: 'pas un projet' }),
    ).toBe('invalide');
    expect(
      await adminDb.select().from(sources).where(eq(sources.ownerUserId, alice.userId)),
    ).toEqual([]);
  });

  it('masque un faux secret dans le tour et dans la version', async () => {
    const [alice] = await pair();
    const key = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT'.repeat(2)}`;

    const written = await note(alice, `La clé : ${key}`);

    expect(await turnTexts(written.id)).toEqual([`La clé : ${SECRET_MASK}`]);
    expect((await stored(written.id)).map((one) => one.texte)).toEqual([`La clé : ${SECRET_MASK}`]);
  });
});

describe('writeNote : la version suivante', () => {
  it('deux v2 depuis v1 : une seule passe', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Première.');

    const results = await Promise.all([
      writeNote(alice, { texte: 'Deux A.', outil: 'claude_code', note: id, version: 1 }),
      writeNote(alice, { texte: 'Deux B.', outil: 'claude_code', note: id, version: 1 }),
    ]);

    expect(results).toEqual(expect.arrayContaining([{ id, n: 2 }, 'depassee']));
    expect((await stored(id)).map((one) => one.n)).toEqual([1, 2]);
  });

  it('après v2, ni searchPassages ni fetchSource ne rendent v1', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Zorglub garde le cache.');
    await indexLast(alice);
    expect(await hits(alice, 'zorglub')).toEqual([id]);

    expect(
      await writeNote(alice, {
        texte: 'Quokka garde le cache.',
        outil: 'claude_code',
        note: id,
        version: 1,
      }),
    ).toEqual({ id, n: 2 });

    // Les passages de v1 sont partis avec l'écriture, avant même la nouvelle indexation.
    expect(await hits(alice, 'zorglub')).toEqual([]);
    await indexLast(alice);
    expect(await hits(alice, 'zorglub')).toEqual([]);
    expect(await hits(alice, 'quokka')).toEqual([id]);
    const fetched = await fetchSource(alice, id);
    expect(fetched?.turns.map((turn) => turn.text)).toEqual(['Quokka garde le cache.']);
    expect(JSON.stringify(fetched)).not.toContain('Zorglub');
    // v1 reste, hors de la recherche.
    expect((await stored(id)).map((one) => one.texte)).toEqual([
      'Zorglub garde le cache.',
      'Quokka garde le cache.',
    ]);
  });

  it('refuse un autre outil, sans rien changer à la note', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Note de Claude Code.');

    for (const outil of ['codex', 'mcp:claude-ai']) {
      expect(
        await writeNote(alice, { texte: 'Réécrite.', outil, note: id, version: 1 }),
        outil,
      ).toBe('autre_outil');
    }
    expect((await stored(id)).map((one) => one.n)).toEqual([1]);
    expect(await turnTexts(id)).toEqual(['Note de Claude Code.']);
  });

  it('une version dépassée ne change rien', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Un.');
    await writeNote(alice, { texte: 'Deux.', outil: 'claude_code', note: id, version: 1 });

    expect(
      await writeNote(alice, { texte: 'Trois.', outil: 'claude_code', note: id, version: 1 }),
    ).toBe('depassee');
    expect(await turnTexts(id)).toEqual(['Deux.']);
  });

  it("l'id d'un fil, d'une session ou d'une note d'un collègue est introuvable, même visible de l'équipe", async () => {
    const [alice, paul] = await pair();
    const thread = await seedThread(alice);
    const { sourceId: session } = await seedSource(alice);
    const { id: theirs } = await note(paul, 'Note de Paul.');
    // Visible de l'équipe : la RLS la montre à Alice, seul le filtre de l'auteur la refuse.
    await adminDb
      .update(sources)
      .set({ acl: [paul.tenantId] })
      .where(eq(sources.id, theirs));

    for (const id of [thread, session, theirs]) {
      expect(
        await writeNote(alice, { texte: 'Réécrite.', outil: 'claude_code', note: id, version: 1 }),
      ).toBe('introuvable');
    }
    expect(await stored(thread)).toEqual([]);
    expect(await turnTexts(theirs)).toEqual(['Note de Paul.']);
  });
});

describe('une note écrite avant ce lot', () => {
  // Écrite par l'ancien remember : un tour, sans version, sans outil.
  async function oldNote(ctx: TenantContext): Promise<string> {
    const { sourceId } = await seedSource(ctx, {
      kind: 'mcp_remember',
      text: 'Ancienne note sur Redis.',
    });
    return sourceId;
  }

  it('reçoit sa v1 depuis son tour, à sa première restauration', async () => {
    const [alice] = await pair();
    const id = await oldNote(alice);

    expect(await restoreVersion(alice, { sourceId: id, n: 1, depuis: 1 })).toEqual({ n: 2 });

    const [first, second] = await stored(id);
    expect(first).toMatchObject({ n: 1, texte: 'Ancienne note sur Redis.', ecritPar: 'agent' });
    expect(second).toMatchObject({
      n: 2,
      texte: 'Ancienne note sur Redis.',
      ecritPar: 'humain',
      motif: 'restauration',
      restaureDe: first?.id,
    });
  });

  it("n'a pas d'outil connu : aucun agent ne la réécrit, et rien n'est écrit", async () => {
    const [alice] = await pair();
    const id = await oldNote(alice);

    for (const outil of ['mcp:claude-ai', 'claude_code']) {
      expect(
        await writeNote(alice, { texte: 'Réécrite.', outil, note: id, version: 1 }),
        outil,
      ).toBe('autre_outil');
    }
    expect(await stored(id)).toEqual([]);
    expect(await turnTexts(id)).toEqual(['Ancienne note sur Redis.']);
  });
});

describe('restoreVersion d’une note', () => {
  it('passe par writeNote : le tour prend le texte restauré, ses passages partent, l’indexation est en file', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Zorglub garde le cache.');
    await writeNote(alice, {
      texte: 'Quokka garde le cache.',
      outil: 'claude_code',
      note: id,
      version: 1,
    });
    await indexLast(alice);
    expect(await hits(alice, 'quokka')).toEqual([id]);
    vi.mocked(enqueuePipelineStep).mockClear();

    expect(await restoreVersion(alice, { sourceId: id, n: 1, depuis: 2 })).toEqual({ n: 3 });

    expect(await hits(alice, 'quokka')).toEqual([]);
    expect(enqueuePipelineStep).toHaveBeenCalledTimes(1);
    await indexLast(alice);
    expect(await hits(alice, 'quokka')).toEqual([]);
    expect(await hits(alice, 'zorglub')).toEqual([id]);
    const fetched = await fetchSource(alice, id);
    expect(fetched?.turns.map((turn) => turn.text)).toEqual(['Zorglub garde le cache.']);
    expect(JSON.stringify(fetched)).not.toContain('Quokka');
    expect((await stored(id)).at(-1)).toMatchObject({ n: 3, ecritPar: 'humain' });
  });

  it('après une restauration sur le site, le même outil écrit la version suivante, un autre est refusé', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Un.', 'codex');
    await writeNote(alice, { texte: 'Deux.', outil: 'codex', note: id, version: 1 });
    expect(await restoreVersion(alice, { sourceId: id, n: 1, depuis: 2 })).toEqual({ n: 3 });

    expect(
      await writeNote(alice, { texte: 'Quatre.', outil: 'claude_code', note: id, version: 3 }),
    ).toBe('autre_outil');
    expect(
      await writeNote(alice, { texte: 'Quatre.', outil: 'codex', note: id, version: 3 }),
    ).toEqual({
      id,
      n: 4,
    });
  });

  it('une restauration dépassée ne change ni la note ni ses passages', async () => {
    const [alice] = await pair();
    const { id } = await note(alice, 'Zorglub.');
    await indexLast(alice);
    await writeNote(alice, { texte: 'Quokka.', outil: 'claude_code', note: id, version: 1 });
    await indexLast(alice);

    expect(await restoreVersion(alice, { sourceId: id, n: 1, depuis: 1 })).toBe('depassee');

    expect(await turnTexts(id)).toEqual(['Quokka.']);
    expect(
      await adminDb.select({ id: passages.id }).from(passages).where(eq(passages.sourceId, id)),
    ).toHaveLength(1);
  });
});
