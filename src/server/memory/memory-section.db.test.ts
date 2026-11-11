import { and, asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { seedSource, seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { correctLesson, retireLesson, writeLesson } from './lessons';
import {
  listMemoryLessons,
  listMemoryRepos,
  listMemoryThreads,
  readMemoryVersion,
  restoreMemoryVersion,
} from './memory-section';
import { writeVersion } from './versions';

// La section Mémoire du site (T55 ; D33, D34, D37, C12, C13 du plan de la mémoire à disposition) : les fils de l'auteur,
// absorbés compris, et ses leçons, avec leurs versions lisibles ; le texte d'une version ; la restauration, sur le site
// seulement, en nouvelle version écrite par l'humain.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const PROJET = 'github.com/acme/leon';
const AUTRE = 'github.com/acme/autre';

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await newTeam(['Alice', 'Paul'], tenantIds);
  return members as [TenantContext, TenantContext];
}

// Un fil de l'auteur sur un dépôt, avec sa branche ; `absorbePar` le marque fusionné, comme threads.ts.
async function thread(
  ctx: TenantContext,
  metadata: { project?: string; branche?: string; absorbePar?: string } = {},
): Promise<string> {
  const id = await seedThread(ctx);
  await adminDb
    .update(sources)
    .set({
      metadata: {
        project: metadata.project ?? PROJET,
        branches: [metadata.branche ?? 'feat/memoire'],
        ...(metadata.absorbePar ? { absorbe_par: metadata.absorbePar } : {}),
      },
    })
    .where(eq(sources.id, id));
  return id;
}

// v(attendue+1) d'un fil, écrite par le serveur.
const version = (ctx: TenantContext, sourceId: string, attendue: number, entrees: string[] = []) =>
  withTenant(ctx, (tx) =>
    writeVersion(tx, ctx, {
      sourceId,
      attendue,
      texte: `Version ${attendue + 1}.`,
      entrees,
      ecritPar: 'serveur',
      motif: 'rangement',
    }),
  );
const threeVersions = async (ctx: TenantContext, sourceId: string) => {
  for (const attendue of [0, 1, 2]) await version(ctx, sourceId, attendue);
};

const stored = (sourceId: string) =>
  adminDb
    .select()
    .from(versionsMemoire)
    .where(eq(versionsMemoire.sourceId, sourceId))
    .orderBy(asc(versionsMemoire.n));

const lesson = async (ctx: TenantContext, texte: string, projet?: string) => {
  const result = await writeLesson(ctx, { texte, projet });
  if (typeof result !== 'object') throw new Error(`leçon non écrite : ${result}`);
  return result.id;
};

describe('listMemoryThreads', () => {
  it('les fils de l’auteur, absorbés compris, avec leurs versions lisibles ; ni ceux d’un collègue, ni une note', async () => {
    const [alice, paul] = await pair();
    const gardé = await thread(alice, { branche: 'feat/garde' });
    const absorbé = await thread(alice, { branche: 'feat/absorbe', absorbePar: gardé });
    await threeVersions(alice, gardé);
    await version(alice, absorbé, 0);
    await thread(paul);
    await seedSource(alice, { kind: 'mcp_remember' });

    const threads = await listMemoryThreads(alice);

    expect(threads).toHaveLength(2);
    expect(threads.find((one) => one.id === gardé)).toEqual({
      id: gardé,
      titre: 'feat/garde',
      projet: PROJET,
      absorbe: false,
      versions: [1, 2, 3].map((n) => ({
        n,
        creeLe: expect.any(Date),
        ecritPar: 'serveur',
        motif: 'rangement',
      })),
    });
    expect(threads.find((one) => one.id === absorbé)).toMatchObject({
      absorbe: true,
      versions: [{ n: 1 }],
    });
  });

  it('une version illisible (une entrée devenue privée) n’est pas listée', async () => {
    const [alice, paul] = await pair();
    const fil = await thread(alice);
    const { sourceId: pr } = await seedSource(paul, { kind: 'github' });
    await adminDb
      .update(sources)
      .set({ acl: [paul.tenantId] })
      .where(eq(sources.id, pr));
    await version(alice, fil, 0);
    await version(alice, fil, 1, [pr]);
    await adminDb
      .update(sources)
      .set({ acl: [paul.userId] })
      .where(eq(sources.id, pr));

    const [listed] = await listMemoryThreads(alice);

    expect(listed?.versions.map((one) => one.n)).toEqual([1]);
  });
});

// Le filtre de l'auteur, en plus de la sécurité par ligne : la politique equipe_lit (0057) ouvre à un manager les
// sources de ses subordonnés quand le contexte lit « avec l'équipe ».
describe('un manager, même avec l’équipe', () => {
  it('ne voit ni les fils, ni les dépôts, ni les versions de son subordonné', async () => {
    const [alice, paul] = await pair();
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb
      .update(members)
      .set({ role: 'owner' })
      .where(and(eq(members.userId, alice.userId), eq(members.organizationId, alice.tenantId)));
    expect(await setManager(alice, await memberOf(paul), await memberOf(alice))).toBe('ok');
    const fil = await thread(paul, { project: 'github.com/paul/perso' });
    await version(paul, fil, 0);
    const manager = { ...alice, equipe: true };

    expect(await listMemoryThreads(manager)).toEqual([]);
    expect(await listMemoryRepos(manager)).toEqual([]);
    expect(await readMemoryVersion(manager, { cible: 'fil', id: fil, n: 1 })).toBeNull();
    expect(await restoreMemoryVersion(manager, { cible: 'fil', id: fil, n: 1, depuis: 1 })).toBe(
      'introuvable',
    );
  });
});

describe('listMemoryLessons', () => {
  it('les leçons non retirées de l’auteur, tous dépôts confondus, avec leurs versions', async () => {
    const [alice, paul] = await pair();
    const ici = await lesson(alice, 'Relancer les tests.', PROJET);
    const ailleurs = await lesson(alice, 'Lire le plan.', AUTRE);
    const partout = await lesson(alice, 'Écrire en français.');
    await correctLesson(alice, { id: ici, texte: 'Relancer les tests en base.', depuis: 1 });
    const retirée = await lesson(alice, 'Ancienne.');
    await retireLesson(alice, retirée);
    await lesson(paul, 'La leçon de Paul.');

    const lessons = await listMemoryLessons(alice);

    expect(lessons.map((one) => one.id).sort()).toEqual([ici, ailleurs, partout].sort());
    expect(lessons.find((one) => one.id === ici)).toEqual({
      id: ici,
      projet: PROJET,
      texte: 'Relancer les tests en base.',
      n: 2,
      accepteeLe: expect.any(Date),
      versions: [
        { n: 1, creeLe: expect.any(Date), ecritPar: 'humain', motif: 'acceptation' },
        { n: 2, creeLe: expect.any(Date), ecritPar: 'humain', motif: 'correction' },
      ],
    });
  });
});

describe('listMemoryRepos', () => {
  it('les dépôts des fils de l’auteur, une fois chacun, dans l’ordre ; jamais ceux d’un collègue', async () => {
    const [alice, paul] = await pair();
    await thread(alice, { project: PROJET });
    await thread(alice, { project: PROJET });
    await thread(alice, { project: AUTRE });
    await thread(paul, { project: 'github.com/paul/perso' });

    expect(await listMemoryRepos(alice)).toEqual([AUTRE, PROJET]);
  });
});

describe('readMemoryVersion', () => {
  it('le texte d’une version lisible s’ouvre, celui d’une version illisible non', async () => {
    const [alice, paul] = await pair();
    const fil = await thread(alice);
    const { sourceId: pr } = await seedSource(paul, { kind: 'github' });
    await adminDb
      .update(sources)
      .set({ acl: [paul.tenantId] })
      .where(eq(sources.id, pr));
    await version(alice, fil, 0);
    await version(alice, fil, 1, [pr]);
    await adminDb
      .update(sources)
      .set({ acl: [paul.userId] })
      .where(eq(sources.id, pr));

    expect(await readMemoryVersion(alice, { cible: 'fil', id: fil, n: 1 })).toEqual({
      n: 1,
      texte: 'Version 1.',
      creeLe: expect.any(Date),
      ecritPar: 'serveur',
      motif: 'rangement',
    });
    expect(await readMemoryVersion(alice, { cible: 'fil', id: fil, n: 2 })).toBeNull();
    expect(await readMemoryVersion(alice, { cible: 'fil', id: fil, n: 3 })).toBeNull();
  });

  it('l’historique d’un fil absorbé se lit', async () => {
    const [alice] = await pair();
    const gardé = await thread(alice);
    const absorbé = await thread(alice, { absorbePar: gardé });
    await version(alice, absorbé, 0);

    expect(await readMemoryVersion(alice, { cible: 'fil', id: absorbé, n: 1 })).toMatchObject({
      texte: 'Version 1.',
    });
  });

  it('la version d’un collègue est introuvable, celle d’une note aussi, et une leçon se lit par sa cible', async () => {
    const [alice, paul] = await pair();
    const fil = await thread(alice);
    await version(alice, fil, 0);
    const { sourceId: note } = await seedSource(alice, { kind: 'mcp_remember' });
    await version(alice, note, 0);
    const leçon = await lesson(alice, 'Relancer les tests.');

    expect(await readMemoryVersion(paul, { cible: 'fil', id: fil, n: 1 })).toBeNull();
    expect(await readMemoryVersion(alice, { cible: 'fil', id: note, n: 1 })).toBeNull();
    expect(await readMemoryVersion(alice, { cible: 'lecon', id: fil, n: 1 })).toBeNull();
    expect(await readMemoryVersion(paul, { cible: 'lecon', id: leçon, n: 1 })).toBeNull();
    expect(await readMemoryVersion(alice, { cible: 'lecon', id: leçon, n: 1 })).toMatchObject({
      texte: 'Relancer les tests.',
      ecritPar: 'humain',
    });
  });
});

describe('restoreMemoryVersion', () => {
  it('remettre v1 d’un fil après v3 donne v4, écrite par l’humain ; v2 et v3 restent', async () => {
    const [alice] = await pair();
    const fil = await thread(alice);
    await threeVersions(alice, fil);
    const [v1] = await stored(fil);

    expect(await restoreMemoryVersion(alice, { cible: 'fil', id: fil, n: 1, depuis: 3 })).toEqual({
      n: 4,
    });
    expect(
      (await stored(fil)).map(({ n, texte, ecritPar, motif, restaureDe }) => ({
        n,
        texte,
        ecritPar,
        motif,
        restaureDe,
      })),
    ).toEqual([
      { n: 1, texte: 'Version 1.', ecritPar: 'serveur', motif: 'rangement', restaureDe: null },
      { n: 2, texte: 'Version 2.', ecritPar: 'serveur', motif: 'rangement', restaureDe: null },
      { n: 3, texte: 'Version 3.', ecritPar: 'serveur', motif: 'rangement', restaureDe: null },
      { n: 4, texte: 'Version 1.', ecritPar: 'humain', motif: 'restauration', restaureDe: v1?.id },
    ]);
  });

  it('depuis une version dépassée : « depassee », rien n’est écrit', async () => {
    const [alice] = await pair();
    const fil = await thread(alice);
    await threeVersions(alice, fil);

    expect(await restoreMemoryVersion(alice, { cible: 'fil', id: fil, n: 1, depuis: 2 })).toBe(
      'depassee',
    );
    expect(await stored(fil)).toHaveLength(3);
  });

  it('le fil d’un collègue, une note ou une version illisible : introuvable, rien n’est écrit', async () => {
    const [alice, paul] = await pair();
    const fil = await thread(alice);
    await threeVersions(alice, fil);
    const { sourceId: note } = await seedSource(alice, { kind: 'mcp_remember' });
    await version(alice, note, 0);

    expect(await restoreMemoryVersion(paul, { cible: 'fil', id: fil, n: 1, depuis: 3 })).toBe(
      'introuvable',
    );
    expect(await restoreMemoryVersion(alice, { cible: 'fil', id: note, n: 1, depuis: 1 })).toBe(
      'introuvable',
    );
    expect(await restoreMemoryVersion(alice, { cible: 'fil', id: fil, n: 9, depuis: 3 })).toBe(
      'introuvable',
    );
    expect(await stored(fil)).toHaveLength(3);
    expect(await stored(note)).toHaveLength(1);
  });

  it('remet une version d’une leçon ; une leçon retirée est introuvable', async () => {
    const [alice] = await pair();
    const id = await lesson(alice, 'Relancer les tests.');
    await correctLesson(alice, { id, texte: 'Ne rien relancer.', depuis: 1 });

    expect(await restoreMemoryVersion(alice, { cible: 'lecon', id, n: 1, depuis: 2 })).toEqual({
      n: 3,
    });
    const [restored] = await listMemoryLessons(alice);
    expect(restored).toMatchObject({ n: 3, texte: 'Relancer les tests.' });
    expect(restored?.versions.at(-1)).toMatchObject({ ecritPar: 'humain', motif: 'restauration' });

    await retireLesson(alice, id);
    expect(await restoreMemoryVersion(alice, { cible: 'lecon', id, n: 2, depuis: 3 })).toBe(
      'introuvable',
    );
  });
});
