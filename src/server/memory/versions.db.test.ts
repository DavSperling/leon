import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '@/capture/mask-secrets';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { fetchSource } from '@/server/search/context';
import { searchPassages } from '@/server/search/search';
import { adminDb } from '@/test/db';
import { seedSource, seedThread } from '@/test/fixtures';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import {
  listVersions,
  readLatest,
  readVersion,
  restoreVersion,
  type WriteInput,
  writeVersion,
} from './versions';

// Les versions de la mémoire (T53 ; D33, D34, C12 du plan de la mémoire à disposition) : écrites en compare-and-set,
// rendues seulement quand le lecteur voit toutes leurs entrées, restaurées en nouvelle version, jamais dans la
// recherche ni dans fetch.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
afterEach(() => {
  vi.restoreAllMocks();
});

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await newTeam(['Alice', 'Paul'], tenantIds);
  return members as [TenantContext, TenantContext];
}

// Une session de code, avec ou sans l'usage `resume` de son outil (metadata.usages, comme record-facts.ts l'écrit).
async function session(ctx: TenantContext, resume = true): Promise<string> {
  const { sourceId } = await seedSource(ctx);
  await setResume(sourceId, resume);
  return sourceId;
}
const setResume = (sourceId: string, resume: boolean) =>
  adminDb
    .update(sources)
    .set({ metadata: { usages: resume ? ['resume'] : [] } })
    .where(eq(sources.id, sourceId));

// Une PR de Paul, visible de l'équipe ; `privatize` la rend privée à Paul, comme aligner_sources_github() (0048).
async function teamPr(paul: TenantContext): Promise<string> {
  const { sourceId } = await seedSource(paul, { kind: 'github' });
  await adminDb
    .update(sources)
    .set({ acl: [paul.tenantId] })
    .where(eq(sources.id, sourceId));
  return sourceId;
}
const privatize = (sourceId: string, paul: TenantContext) =>
  adminDb
    .update(sources)
    .set({ acl: [paul.userId] })
    .where(eq(sources.id, sourceId));

const write = (
  ctx: TenantContext,
  input: Pick<WriteInput, 'sourceId' | 'attendue'> & Partial<WriteInput>,
) =>
  withTenant(ctx, (tx) =>
    writeVersion(tx, ctx, {
      texte: `Version ${input.attendue + 1}.`,
      entrees: [],
      ecritPar: 'serveur',
      motif: 'rangement',
      ...input,
    }),
  );

const stored = (sourceId: string) =>
  adminDb
    .select()
    .from(versionsMemoire)
    .where(eq(versionsMemoire.sourceId, sourceId))
    .orderBy(asc(versionsMemoire.n));

describe('writeVersion', () => {
  it('deux écritures depuis vn : une seule v(n+1), l’autre « dépassée »', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    expect(await write(alice, { sourceId: thread, attendue: 0 })).toEqual({ n: 1 });

    const results = await Promise.all([
      write(alice, { sourceId: thread, attendue: 1, texte: 'Première.' }),
      write(alice, { sourceId: thread, attendue: 1, texte: 'Seconde.' }),
    ]);

    expect(results).toEqual(expect.arrayContaining([{ n: 2 }, 'depassee']));
    expect((await stored(thread)).map((row) => row.n)).toEqual([1, 2]);
  });

  it('un faux secret écrit dans une version est masqué en base', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const key = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT'.repeat(2)}`;

    await write(alice, { sourceId: thread, attendue: 0, texte: `La clé : ${key}` });

    const [row] = await stored(thread);
    expect(row?.texte).toBe(`La clé : ${SECRET_MASK}`);
  });

  it("n'écrit ni sur le fil d'un collègue ni sur une session", async () => {
    const [alice, paul] = await pair();
    const { sourceId: own } = await seedSource(alice);
    const theirs = await seedThread(paul);

    expect(await write(alice, { sourceId: own, attendue: 0 })).toBe('introuvable');
    expect(await write(alice, { sourceId: theirs, attendue: 0 })).toBe('introuvable');
    expect([...(await stored(own)), ...(await stored(theirs))]).toEqual([]);
  });

  it('les compteurs avancent d’une écriture, d’une dépassée et d’une restauration, sans texte ni id', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const counted = () => info.mock.calls.filter((call) => call[0] === '[leon]');

    await write(alice, { sourceId: thread, attendue: 0 });
    expect(counted()).toEqual([['[leon]', 'versions.ecrite']]);
    await write(alice, { sourceId: thread, attendue: 0 });
    expect(counted().at(-1)).toEqual(['[leon]', 'versions.depassee']);
    await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 1 });

    expect(counted()).toEqual([
      ['[leon]', 'versions.ecrite'],
      ['[leon]', 'versions.depassee'],
      ['[leon]', 'versions.ecrite'],
      ['[leon]', 'versions.restauree'],
    ]);
  });
});

describe('la lecture des versions', () => {
  it('une entrée rendue privée (comme par 0048) : la version n’est pas rendue', async () => {
    const [alice, paul] = await pair();
    const thread = await seedThread(alice);
    const pr = await teamPr(paul);
    await write(alice, { sourceId: thread, attendue: 0, texte: 'La PR avance.', entrees: [pr] });
    expect((await readVersion(alice, thread, 1))?.texte).toBe('La PR avance.');

    await privatize(pr, paul);

    expect(await readVersion(alice, thread, 1)).toBeNull();
    expect(await listVersions(alice, thread)).toEqual([]);
    expect(await readLatest(alice, thread)).toEqual({ n: 1, version: null });
  });

  it("v2 illisible et v1 lisible : la lecture de l'état rend l'état déterministe, jamais v1", async () => {
    const [alice, paul] = await pair();
    const thread = await seedThread(alice);
    const pr = await teamPr(paul);
    await write(alice, { sourceId: thread, attendue: 0, texte: 'Avant la PR.' });
    await write(alice, { sourceId: thread, attendue: 1, texte: 'Avec la PR.', entrees: [pr] });

    await privatize(pr, paul);

    // null : l'appelant rend l'état déterministe, calculé sur les seules sources visibles (T43, T44).
    expect(await readLatest(alice, thread)).toEqual({ n: 2, version: null });
    // v1 reste archivée et lisible dans l'historique, jamais à la place de v2.
    expect((await readVersion(alice, thread, 1))?.texte).toBe('Avant la PR.');
    expect((await listVersions(alice, thread)).map((version) => version.n)).toEqual([1]);
  });

  it("un usage resume retiré d'une session d'entrée : l'état du fil n'est pas rendu, une note qui la cite l'est encore", async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const { sourceId: note } = await seedSource(alice, { kind: 'mcp_remember' });
    const code = await session(alice);
    await write(alice, {
      sourceId: thread,
      attendue: 0,
      texte: 'Tiré du résumé.',
      entrees: [code],
      ecritPar: 'modele',
      etape: 'fil',
    });
    await write(alice, {
      sourceId: note,
      attendue: 0,
      texte: 'Ma note.',
      entrees: [code],
      ecritPar: 'agent',
      motif: 'note',
    });
    expect((await readLatest(alice, thread)).version?.texte).toBe('Tiré du résumé.');

    await setResume(code, false);

    expect(await readLatest(alice, thread)).toEqual({ n: 1, version: null });
    expect((await readLatest(alice, note)).version?.texte).toBe('Ma note.');
  });

  it("la version d'un collègue est introuvable par la lecture", async () => {
    const [alice, paul] = await pair();
    const thread = await seedThread(alice);
    await write(alice, { sourceId: thread, attendue: 0 });

    expect(await readVersion(paul, thread, 1)).toBeNull();
    expect(await listVersions(paul, thread)).toEqual([]);
    expect(await readLatest(paul, thread)).toEqual({ n: 0, version: null });
  });

  it('searchPassages et fetchSource ne rendent aucune version', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const { sourceId: note } = await seedIndexed(alice, {
      kind: 'mcp_remember',
      turns: [{ text: 'Note sur le cache de Redis.' }],
    });
    await write(alice, { sourceId: thread, attendue: 0, texte: 'Zorglub dans le fil.' });
    await write(alice, { sourceId: note, attendue: 0, texte: 'Zorglub dans la note.' });

    expect((await searchPassages(alice, { query: 'zorglub' })).hits).toEqual([]);
    expect((await searchPassages(alice, { query: 'redis' })).hits).toHaveLength(1);
    expect((await fetchSource(alice, thread))?.turns).toEqual([]);
    expect((await fetchSource(alice, note))?.turns.map((turn) => turn.text)).toEqual([
      'Note sur le cache de Redis.',
    ]);
  });
});

describe('restoreVersion', () => {
  it('restaurer v1 après v3 donne v4, et v2 et v3 restent', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    for (const [attendue, texte] of [
      [0, 'Un.'],
      [1, 'Deux.'],
      [2, 'Trois.'],
    ] as const) {
      await write(alice, { sourceId: thread, attendue, texte });
    }

    expect(await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 3 })).toEqual({ n: 4 });
    // Une restauration d'une restauration pointe encore vers le texte d'origine.
    expect(await restoreVersion(alice, { sourceId: thread, n: 4, depuis: 4 })).toEqual({ n: 5 });

    const rows = await stored(thread);
    expect(rows.map(({ n, texte, ecritPar, motif }) => ({ n, texte, ecritPar, motif }))).toEqual([
      { n: 1, texte: 'Un.', ecritPar: 'serveur', motif: 'rangement' },
      { n: 2, texte: 'Deux.', ecritPar: 'serveur', motif: 'rangement' },
      { n: 3, texte: 'Trois.', ecritPar: 'serveur', motif: 'rangement' },
      { n: 4, texte: 'Un.', ecritPar: 'humain', motif: 'restauration' },
      { n: 5, texte: 'Un.', ecritPar: 'humain', motif: 'restauration' },
    ]);
    expect(rows.slice(3).map((row) => row.restaureDe)).toEqual([rows[0]?.id, rows[0]?.id]);
  });

  it('restaurer une version illisible, ou depuis une version dépassée : refus', async () => {
    const [alice, paul] = await pair();
    const thread = await seedThread(alice);
    const pr = await teamPr(paul);
    await write(alice, { sourceId: thread, attendue: 0, entrees: [pr] });
    await write(alice, { sourceId: thread, attendue: 1 });
    await privatize(pr, paul);

    expect(await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 2 })).toBe('illisible');
    expect(await restoreVersion(alice, { sourceId: thread, n: 2, depuis: 1 })).toBe('depassee');
    expect(await restoreVersion(paul, { sourceId: thread, n: 2, depuis: 2 })).toBe('illisible');
    expect((await stored(thread)).map((row) => row.n)).toEqual([1, 2]);
  });

  it('restaurer une version du modèle, puis retirer resume d’une session d’entrée : la version restaurée n’est plus rendue', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const code = await session(alice);
    await write(alice, {
      sourceId: thread,
      attendue: 0,
      texte: 'Tiré du résumé.',
      entrees: [code],
      ecritPar: 'modele',
    });
    await write(alice, {
      sourceId: thread,
      attendue: 1,
      texte: 'Autre état.',
      entrees: [code],
      ecritPar: 'modele',
    });
    await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 2 });
    expect((await readLatest(alice, thread)).version).toMatchObject({
      n: 3,
      texte: 'Tiré du résumé.',
      ecritPar: 'humain',
    });

    await setResume(code, false);

    expect(await readLatest(alice, thread)).toEqual({ n: 3, version: null });
    expect(await readVersion(alice, thread, 3)).toBeNull();
  });

  it('une source de plus après la restauration d’une version du modèle : aucune version serveur ne l’écrase', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const code = await session(alice);
    const { sourceId: more } = await seedSource(alice, { kind: 'slack' });
    await write(alice, { sourceId: thread, attendue: 0, entrees: [code], ecritPar: 'modele' });
    await write(alice, { sourceId: thread, attendue: 1, entrees: [code], ecritPar: 'modele' });
    await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 2 });

    expect(await write(alice, { sourceId: thread, attendue: 3, entrees: [code, more] })).toBe(
      'gardee',
    );
    expect((await stored(thread)).map((row) => row.n)).toEqual([1, 2, 3]);

    // La version du modèle devenue illisible ne protège plus rien : la liste du serveur s'écrit.
    await setResume(code, false);
    expect(await write(alice, { sourceId: thread, attendue: 3, entrees: [code, more] })).toEqual({
      n: 4,
    });
  });

  it('la liste du serveur remplace une restauration de sa propre liste', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    await write(alice, { sourceId: thread, attendue: 0 });
    await restoreVersion(alice, { sourceId: thread, n: 1, depuis: 1 });

    expect(await write(alice, { sourceId: thread, attendue: 2 })).toEqual({ n: 3 });
  });
});
