import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { SECRET_MASK } from '@/capture/mask-secrets';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lecons, readLog, sources, versionsMemoire } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedSource } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import {
  correctLesson,
  type Lesson,
  listLessons,
  readLesson,
  retireLesson,
  writeLesson,
} from './lessons';
import { recordReads } from './read-log';
import { listVersions, restoreVersion } from './versions';

// Les leçons (T55 ; D33, D34, D37, C13 du plan de la mémoire à disposition) : écrites, corrigées et retirées par
// l'auteur, versionnées, listées dans l'ordre de D37 avec leur dernière version lisible.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const PROJET = 'github.com/acme/leon';
const AUTRE = 'github.com/acme/autre';

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await newTeam(['Alice', 'Paul'], tenantIds);
  return members as [TenantContext, TenantContext];
}

const written = async (ctx: TenantContext, texte: string, projet?: string) => {
  const result = await writeLesson(ctx, { texte, projet });
  if (typeof result !== 'object') throw new Error(`leçon non écrite : ${result}`);
  return result.id;
};
const set = (id: string, values: Partial<typeof lecons.$inferInsert>) =>
  adminDb.update(lecons).set(values).where(eq(lecons.id, id));
const stored = (leconId: string) =>
  adminDb
    .select()
    .from(versionsMemoire)
    .where(eq(versionsMemoire.leconId, leconId))
    .orderBy(asc(versionsMemoire.n));
const textes = (list: Lesson[]) => list.map((lesson) => lesson.texte);

describe('writeLesson', () => {
  it('écrit la leçon et sa v1, par l’humain, privée à l’auteur', async () => {
    const [alice] = await pair();

    const result = await writeLesson(alice, {
      texte: '  Relancer les tests en base.  ',
      projet: PROJET,
    });

    expect(result).toEqual({ id: expect.any(String), n: 1 });
    const id = typeof result === 'object' ? result.id : '';
    expect(await adminDb.select().from(lecons).where(eq(lecons.id, id))).toEqual([
      expect.objectContaining({
        ownerUserId: alice.userId,
        projet: PROJET,
        origine: 'humain',
        frequence: 0,
        retireeLe: null,
        acl: [alice.userId],
      }),
    ]);
    expect(await stored(id)).toEqual([
      expect.objectContaining({
        n: 1,
        texte: 'Relancer les tests en base.',
        sourceId: null,
        ecritPar: 'humain',
        entrees: [],
      }),
    ]);
  });

  it('refuse un texte vide ou de plus de 300 caractères, et un dépôt hors de la forme, sans rien écrire', async () => {
    const [alice] = await pair();

    expect(await writeLesson(alice, { texte: '   ' })).toBe('invalide');
    expect(await writeLesson(alice, { texte: 'x'.repeat(301) })).toBe('invalide');
    expect(
      await writeLesson(alice, { texte: 'Bien.', projet: 'https://github.com/acme/leon' }),
    ).toBe('invalide');
    expect(await writeLesson(alice, { texte: 'x'.repeat(300) })).toMatchObject({ n: 1 });
    expect(
      await adminDb.select().from(lecons).where(eq(lecons.ownerUserId, alice.userId)),
    ).toHaveLength(1);
  });

  it('un faux secret dans une leçon est masqué en base', async () => {
    const [alice] = await pair();
    const key = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT'.repeat(2)}`;

    const id = await written(alice, `La clé : ${key}`);

    const [row] = await stored(id);
    expect(row?.texte).toBe(`La clé : ${SECRET_MASK}`);
    expect((await readLesson(alice, id))?.texte).toBe(`La clé : ${SECRET_MASK}`);
  });

  it('le masque allonge une leçon à la borne : elle est coupée à 300 caractères, pas refusée', async () => {
    const [alice] = await pair();
    const texte = 'DB_PASSWORD=ab\n'.repeat(20);
    expect(texte.length).toBe(300);

    const id = await written(alice, texte);

    const [row] = await stored(id);
    expect(row?.texte).toHaveLength(300);
    expect(row?.texte).not.toContain('=ab');
  });
});

describe('listLessons', () => {
  it("l'ordre de D37 : celles du dépôt, puis les plus fréquentes, puis les plus récentes ; jamais un autre dépôt", async () => {
    const [alice] = await pair();
    const old = new Date('2026-10-01T09:00:00.000Z');
    const recent = new Date('2026-11-01T09:00:00.000Z');
    const depot = await written(alice, 'Du dépôt.', PROJET);
    const frequente = await written(alice, 'Fréquente.');
    const recente = await written(alice, 'Récente.');
    const ancienne = await written(alice, 'Ancienne.');
    const ailleurs = await written(alice, "D'un autre dépôt.", AUTRE);
    await set(depot, { accepteeLe: old });
    await set(frequente, { frequence: 5, accepteeLe: old });
    await set(recente, { accepteeLe: recent });
    await set(ancienne, { accepteeLe: old });
    await set(ailleurs, { frequence: 9, accepteeLe: recent });

    expect(textes(await listLessons(alice, PROJET))).toEqual([
      'Du dépôt.',
      'Fréquente.',
      'Récente.',
      'Ancienne.',
    ]);
    // Sans dépôt, toutes les leçons de l'auteur, pour la section Mémoire du site : celles d'un dépôt d'abord.
    expect(textes(await listLessons(alice))).toEqual([
      "D'un autre dépôt.",
      'Du dépôt.',
      'Fréquente.',
      'Récente.',
      'Ancienne.',
    ]);
  });

  it('rend la dernière version lisible, jamais une plus ancienne à sa place', async () => {
    const [alice, paul] = await pair();
    const corrigee = await written(alice, 'Première.');
    expect(await correctLesson(alice, { id: corrigee, texte: 'Corrigée.', depuis: 1 })).toEqual({
      n: 2,
    });
    // v2 cite une preuve que Paul rend privée, comme aligner_sources_github() (0048) : la leçon ne se montre plus.
    const cachee = await written(alice, 'Lisible.');
    const { sourceId: preuve } = await seedSource(paul, { kind: 'github' });
    await adminDb
      .update(sources)
      .set({ acl: [paul.tenantId] })
      .where(eq(sources.id, preuve));
    await adminDb.insert(versionsMemoire).values({
      tenantId: alice.tenantId,
      ownerUserId: alice.userId,
      leconId: cachee,
      n: 2,
      texte: 'Tirée de la PR.',
      entrees: [preuve],
      ecritPar: 'humain',
      motif: 'correction',
      acl: [alice.userId],
    });
    expect((await readLesson(alice, cachee))?.texte).toBe('Tirée de la PR.');

    await adminDb
      .update(sources)
      .set({ acl: [paul.userId] })
      .where(eq(sources.id, preuve));

    expect(textes(await listLessons(alice, PROJET))).toEqual(['Corrigée.']);
    expect(await readLesson(alice, cachee)).toBeNull();
    expect(await readLesson(alice, corrigee)).toMatchObject({ n: 2, texte: 'Corrigée.' });
  });

  it("la leçon d'un collègue est introuvable", async () => {
    const [alice, paul] = await pair();
    const theirs = await written(paul, 'À Paul.', PROJET);

    expect(await listLessons(alice, PROJET)).toEqual([]);
    expect(await readLesson(alice, theirs)).toBeNull();
    expect(await correctLesson(alice, { id: theirs, texte: 'Volée.', depuis: 1 })).toBe(
      'introuvable',
    );
    expect(await retireLesson(alice, theirs)).toBe(false);
    expect((await stored(theirs)).map((row) => row.texte)).toEqual(['À Paul.']);
  });
});

describe('retireLesson', () => {
  it('une leçon retirée sort des listes, et ses versions restent', async () => {
    const [alice] = await pair();
    const id = await written(alice, 'À retirer.', PROJET);
    await correctLesson(alice, { id, texte: 'Corrigée.', depuis: 1 });

    expect(await retireLesson(alice, id)).toBe(true);

    expect(await listLessons(alice, PROJET)).toEqual([]);
    expect(await listLessons(alice)).toEqual([]);
    expect(await readLesson(alice, id)).toBeNull();
    expect(await correctLesson(alice, { id, texte: 'Encore.', depuis: 2 })).toBe('introuvable');
    expect((await stored(id)).map((row) => row.n)).toEqual([1, 2]);
    expect(await retireLesson(alice, id)).toBe(false);
  });
});

describe('correctLesson', () => {
  it('deux corrections depuis la même version : une seule passe, l’autre « modifiée entre-temps »', async () => {
    const [alice] = await pair();
    const id = await written(alice, 'Première.');

    const results = await Promise.all([
      correctLesson(alice, { id, texte: 'Onglet A.', depuis: 1 }),
      correctLesson(alice, { id, texte: 'Onglet B.', depuis: 1 }),
    ]);

    expect(results).toEqual(expect.arrayContaining([{ n: 2 }, 'depassee']));
    expect((await stored(id)).map((row) => row.n)).toEqual([1, 2]);
    expect(await stored(id)).toEqual([
      expect.anything(),
      expect.objectContaining({ ecritPar: 'humain', motif: 'correction' }),
    ]);
  });

  it('garde les preuves de la dernière version, et refuse un texte invalide', async () => {
    const [alice] = await pair();
    const id = await written(alice, 'Première.');
    const { sourceId: preuve } = await seedSource(alice);
    await adminDb.insert(versionsMemoire).values({
      tenantId: alice.tenantId,
      ownerUserId: alice.userId,
      leconId: id,
      n: 2,
      texte: 'Avec preuve.',
      entrees: [preuve],
      ecritPar: 'humain',
      motif: 'acceptation',
      acl: [alice.userId],
    });

    expect(await correctLesson(alice, { id, texte: 'x'.repeat(301), depuis: 2 })).toBe('invalide');
    expect(await correctLesson(alice, { id, texte: 'Corrigée.', depuis: 2 })).toEqual({ n: 3 });

    expect((await stored(id)).at(-1)?.entrees).toEqual([preuve]);
  });
});

describe('les versions d’une leçon', () => {
  it('se listent et se restaurent comme celles d’un fil : restaurer v1 après v2 donne v3, et v2 reste', async () => {
    const [alice, paul] = await pair();
    const id = await written(alice, 'Première.');
    await correctLesson(alice, { id, texte: 'Seconde.', depuis: 1 });

    expect(await restoreVersion(paul, { leconId: id, n: 1, depuis: 2 })).toBe('illisible');
    expect(await restoreVersion(alice, { leconId: id, n: 1, depuis: 2 })).toEqual({ n: 3 });

    expect((await listVersions(alice, { leconId: id })).map((one) => [one.n, one.motif])).toEqual([
      [1, 'acceptation'],
      [2, 'correction'],
      [3, 'restauration'],
    ]);
    expect(await listVersions(paul, { leconId: id })).toEqual([]);
    expect(await readLesson(alice, id)).toMatchObject({ n: 3, texte: 'Première.' });
  });
});

describe('recordReads', () => {
  it('note une lecture de leçon par lecon_id, jamais celle d’un collègue', async () => {
    const [alice, paul] = await pair();
    const mine = await written(alice, 'À moi.');
    const theirs = await written(paul, 'À Paul.');

    const noted = await recordReads(alice, {
      tool: 'lessons',
      client: 'cli',
      reads: [{ leconId: mine }, { leconId: theirs }],
    });

    expect(noted).toEqual(new Set([mine]));
    expect(
      await adminDb
        .select({
          leconId: readLog.leconId,
          sourceId: readLog.sourceId,
          tool: readLog.tool,
          acl: readLog.acl,
        })
        .from(readLog)
        .where(eq(readLog.userId, alice.userId)),
    ).toEqual([{ leconId: mine, sourceId: null, tool: 'lessons', acl: [alice.userId] }]);
  });
});
