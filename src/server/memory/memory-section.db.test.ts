import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { searchPassages } from '@/server/search/search';
import { adminDb } from '@/test/db';
import { seedSource, seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { correctLesson, retireLesson, writeLesson } from './lessons';
import {
  listMemoryLessons,
  listMemoryNotes,
  listMemoryRepos,
  listMemoryThreads,
  readMemoryVersion,
  restoreMemoryVersion,
} from './memory-section';
import { writeNote } from './notes';
import { writeVersion } from './versions';

// La section Mémoire du site (T55 ; D33, D34, D37, C12, C13 du plan de la mémoire à disposition) : les fils de l'auteur,
// absorbés compris, et ses leçons, avec leurs versions lisibles ; le texte d'une version ; la restauration, sur le site
// seulement, en nouvelle version écrite par l'humain. T57 y ajoute les notes de l'agent : leur liste, le texte d'une
// version, et la remise par le chemin de writeNote (le tour indexé suit).

// writeNote met l'indexation en file : pas de pg-boss ici, et le point du matin n'est pas signalé.
vi.mock('@/server/pipeline/queue');
vi.mock('@/server/briefing/queue');
beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

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

// Une note de l'auteur par writeNote, avec son outil et son dépôt ; `outil` à `mcp:<libellé>` pour remember.
async function note(ctx: TenantContext, texte: string, outil = 'claude_code', projet?: string) {
  const written = await writeNote(ctx, { texte, outil, projet });
  if (typeof written !== 'object') throw new Error(`note non écrite : ${written}`);
  return written.id;
}
const rewriteNote = (
  ctx: TenantContext,
  id: string,
  texte: string,
  version: number,
  outil: string,
) => writeNote(ctx, { texte, outil, note: id, version });
// L'indexation que writeNote a mise en file, lancée à la main : le dernier run demandé.
async function indexLast(ctx: TenantContext): Promise<void> {
  const job = vi.mocked(enqueuePipelineStep).mock.calls.at(-1)?.[1] as
    | { ingestRunId: string }
    | undefined;
  if (!job) throw new Error('aucune indexation en file');
  await indexIngestRun(
    { ingestRunId: job.ingestRunId, tenantId: ctx.tenantId, userId: ctx.userId },
    { embedder: null },
  );
}
const hits = async (ctx: TenantContext, query: string) =>
  (await searchPassages(ctx, { query })).hits.map((hit) => hit.sourceId);

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
      n: 3,
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
    // Le numéro de la dernière, lisible ou non : celui que la restauration attend (D34).
    expect(listed?.n).toBe(2);
  });

  it('la dernière version illisible : remettre v1 avec le numéro rendu par la liste donne v5', async () => {
    const [alice, paul] = await pair();
    const fil = await thread(alice);
    const { sourceId: pr } = await seedSource(paul, { kind: 'github' });
    await adminDb
      .update(sources)
      .set({ acl: [paul.tenantId] })
      .where(eq(sources.id, pr));
    await threeVersions(alice, fil);
    await version(alice, fil, 3, [pr]);
    await adminDb
      .update(sources)
      .set({ acl: [paul.userId] })
      .where(eq(sources.id, pr));
    const [listed] = await listMemoryThreads(alice);
    expect(listed?.versions.map((one) => one.n)).toEqual([1, 2, 3]);

    expect(
      await restoreMemoryVersion(alice, { cible: 'fil', id: fil, n: 1, depuis: listed?.n ?? 0 }),
    ).toEqual({ n: 5 });
    expect((await stored(fil)).at(-1)).toMatchObject({
      n: 5,
      texte: 'Version 1.',
      ecritPar: 'humain',
    });
  });

  it('un fil sans version : aucune version, et 0', async () => {
    const [alice] = await pair();
    await thread(alice);

    expect(await listMemoryThreads(alice)).toEqual([
      expect.objectContaining({ n: 0, versions: [] }),
    ]);
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
    const noteId = await note(
      paul,
      'La note privée de Paul.',
      'claude_code',
      'github.com/paul/perso',
    );
    const manager = { ...alice, equipe: true };

    expect(await listMemoryThreads(manager)).toEqual([]);
    expect(await listMemoryNotes(manager)).toEqual([]);
    expect(await readMemoryVersion(manager, { cible: 'note', id: noteId, n: 1 })).toBeNull();
    expect(
      await restoreMemoryVersion(manager, { cible: 'note', id: noteId, n: 1, depuis: 1 }),
    ).toBe('introuvable');
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

describe('listMemoryNotes', () => {
  it('les notes de l’auteur, celles de leon note et celles de remember, avec leur outil, leur dépôt et leurs versions ; ni un fil, ni la note d’un collègue', async () => {
    const [alice, paul] = await pair();
    const cli = await note(alice, 'Le cache tombe le lundi.', 'claude_code', PROJET);
    const web = await note(alice, 'Penser à relire le plan.', 'mcp:claude-ai');
    await rewriteNote(alice, cli, 'Le cache tombe le lundi matin.', 1, 'claude_code');
    await thread(alice);
    await note(paul, 'La note de Paul.');

    const notes = await listMemoryNotes(alice);

    expect(notes.map((one) => one.id).sort()).toEqual([cli, web].sort());
    expect(notes.find((one) => one.id === cli)).toEqual({
      id: cli,
      titre: 'Le cache tombe le lundi matin.',
      outil: 'Claude Code',
      projet: PROJET,
      creeLe: expect.any(Date),
      n: 2,
      versions: [
        { n: 1, creeLe: expect.any(Date), ecritPar: 'agent', motif: 'note' },
        { n: 2, creeLe: expect.any(Date), ecritPar: 'agent', motif: 'note' },
      ],
    });
    expect(notes.find((one) => one.id === web)).toMatchObject({
      outil: 'claude-ai',
      projet: null,
      n: 1,
    });
  });

  it('une note d’avant les versions : aucune version, et 0 ; sans outil connu, ni outil ni dépôt', async () => {
    const [alice] = await pair();
    const { sourceId } = await seedSource(alice, { kind: 'mcp_remember', title: 'Ancienne note.' });

    expect(await listMemoryNotes(alice)).toEqual([
      expect.objectContaining({
        id: sourceId,
        titre: 'Ancienne note.',
        outil: null,
        projet: null,
        n: 0,
        versions: [],
      }),
    ]);
  });

  it('le titre tient sur une ligne', async () => {
    const [alice] = await pair();
    await note(alice, 'Première ligne.\nDeuxième ligne.');

    expect((await listMemoryNotes(alice))[0]?.titre).toBe('Première ligne. Deuxième ligne.');
  });
});

describe('une note : le texte d’une version', () => {
  it('s’ouvre pour son auteur ; celle d’un collègue est introuvable, et un fil ne s’ouvre pas comme une note', async () => {
    const [alice, paul] = await pair();
    const id = await note(alice, 'Zorglub garde le cache.');
    await rewriteNote(alice, id, 'Quokka garde le cache.', 1, 'claude_code');
    const fil = await thread(alice);
    await version(alice, fil, 0);

    expect(await readMemoryVersion(alice, { cible: 'note', id, n: 1 })).toEqual({
      n: 1,
      texte: 'Zorglub garde le cache.',
      creeLe: expect.any(Date),
      ecritPar: 'agent',
      motif: 'note',
    });
    expect(await readMemoryVersion(alice, { cible: 'note', id, n: 3 })).toBeNull();
    expect(await readMemoryVersion(paul, { cible: 'note', id, n: 1 })).toBeNull();
    expect(await readMemoryVersion(alice, { cible: 'note', id: fil, n: 1 })).toBeNull();
  });
});

describe('une note : remettre une version', () => {
  it('v1 après v2 donne v3, écrite par l’humain, et la recherche ne rend plus le texte de v2', async () => {
    const [alice] = await pair();
    const id = await note(alice, 'Zorglub garde le cache.');
    await rewriteNote(alice, id, 'Quokka garde le cache.', 1, 'claude_code');
    await indexLast(alice);
    expect(await hits(alice, 'quokka')).toEqual([id]);

    expect(await restoreMemoryVersion(alice, { cible: 'note', id, n: 1, depuis: 2 })).toEqual({
      n: 3,
    });
    await indexLast(alice);

    const [listed] = await listMemoryNotes(alice);
    expect(listed).toMatchObject({ n: 3, titre: 'Zorglub garde le cache.' });
    expect(listed?.versions.at(-1)).toMatchObject({
      n: 3,
      ecritPar: 'humain',
      motif: 'restauration',
    });
    expect(await stored(id)).toHaveLength(3);
    expect(await hits(alice, 'quokka')).toEqual([]);
    expect(await hits(alice, 'zorglub')).toEqual([id]);
  });

  it('depuis une version dépassée : « depassee », rien n’est écrit ; la note d’un collègue : introuvable', async () => {
    const [alice, paul] = await pair();
    const id = await note(alice, 'Un.');
    await rewriteNote(alice, id, 'Deux.', 1, 'claude_code');

    expect(await restoreMemoryVersion(alice, { cible: 'note', id, n: 1, depuis: 1 })).toBe(
      'depassee',
    );
    expect(await restoreMemoryVersion(paul, { cible: 'note', id, n: 1, depuis: 2 })).toBe(
      'introuvable',
    );
    expect(await restoreMemoryVersion(alice, { cible: 'note', id, n: 9, depuis: 2 })).toBe(
      'introuvable',
    );
    expect(await stored(id)).toHaveLength(2);
  });
});
