import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { CodeSessionKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import * as readLogModule from '@/server/memory/read-log';
import { type WriteInput, writeVersion } from '@/server/memory/versions';
import { adminDb } from '@/test/db';
import { seedSource, seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import {
  readDossier as dossierOf,
  etatCourt,
  filTitle,
  readThread as threadOf,
  readVersions as versionsOf,
} from './thread-read';
import { enqueueFilMaj } from './threads-queue';

// La lecture commune des fils (T44, T54 ; C9, C12, D24, D27, D33, D35 du plan de la mémoire à disposition), sur la
// base de test. La file est simulée : une lecture ne met jamais rien en file.

vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  enqueueFilMaj: vi.fn(),
}));

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
afterEach(() => {
  vi.restoreAllMocks();
});

async function team(): Promise<[TenantContext, TenantContext]> {
  const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
  return members as [TenantContext, TenantContext];
}

const NOV_5 = new Date('2026-11-05T10:00:00.000Z');

// Une session de code de l'auteur, avec l'usage `resume`, datée de son dernier tour.
async function session(
  owner: TenantContext,
  input: { kind?: CodeSessionKind; date?: Date } = {},
): Promise<string> {
  const date = input.date ?? NOV_5;
  const { sourceId } = await seedRun(owner, {
    kind: input.kind ?? 'claude_code',
    status: 'done',
    metadata: { project: PROJECT, usages: ['resume'] },
    turns: [{ text: 'Tour.', ts: date }],
    lastTurnAt: date,
  });
  return sourceId;
}

// Une source qu'un fil relie : par défaut un message Slack visible de l'équipe.
async function linked(
  owner: TenantContext,
  input: { kind?: 'slack' | 'github'; title?: string; externalId?: string; metadata?: object } = {},
): Promise<string> {
  const { sourceId } = await seedRun(owner, {
    kind: input.kind ?? 'slack',
    acl: [owner.tenantId],
    status: 'done',
    title: input.title ?? 'Canal produit',
    externalId: input.externalId,
    metadata: { ...input.metadata },
  });
  return sourceId;
}

// Une PR du dépôt relevée par GitHub, visible de l'équipe, avec son état (T13).
const pr = (owner: TenantContext, numero: number, etat: string) =>
  linked(owner, {
    kind: 'github',
    externalId: `pr:acme/leon#${numero}`,
    title: `#${numero} Titre de la PR`,
    metadata: { origin: { repo: 'acme/leon', etat } },
  });

// Rendue privée à un autre (comme par aligner_sources_github(), 0048).
const privatize = (sourceId: string, to: TenantContext) =>
  adminDb
    .update(sources)
    .set({ acl: [to.userId] })
    .where(eq(sources.id, sourceId));

type Lists = {
  project?: string;
  branches?: string[];
  sessions?: string[];
  prs?: number[];
  liees?: string[];
  tickets?: string[];
  extra?: Record<string, unknown>;
};
// Un fil de l'auteur, avec ses listes, comme le rangement et la liaison les écrivent (D21).
async function fil(owner: TenantContext, lists: Lists = {}): Promise<string> {
  const id = await seedThread(owner);
  await setLists(id, lists);
  return id;
}
const setLists = (id: string, lists: Lists) =>
  adminDb
    .update(sources)
    .set({
      metadata: sql`${sources.metadata} || ${JSON.stringify({
        project: lists.project ?? PROJECT,
        branches: lists.branches ?? ['paul/fil'],
        sessions: (lists.sessions ?? []).map((one) => ({
          id: one,
          kind: 'claude_code',
          date: NOV_5.toISOString(),
        })),
        prs: (lists.prs ?? []).map((numero) => ({ repo: 'acme/leon', numero, par: 'pr-link' })),
        liees: (lists.liees ?? []).map((one) => ({ id: one, cle: 'lien' })),
        tickets: lists.tickets ?? [],
        ...lists.extra,
      })}::jsonb`,
    })
    .where(eq(sources.id, id));

const write = (
  ctx: TenantContext,
  input: Pick<WriteInput, 'sourceId' | 'attendue' | 'texte'> & Partial<WriteInput>,
) =>
  withTenant(ctx, (tx) =>
    writeVersion(tx, ctx, { entrees: [], ecritPar: 'serveur', motif: 'rangement', ...input }),
  );

const modelState = (sessionId: string) =>
  [
    "## Où j'en suis",
    `Le worker de l'état est branché. (de: toi; source: ${sessionId})`,
    '',
    `- [en-cours] Les tests (de: toi; source: ${sessionId})`,
  ].join('\n');

// Chaque lecture passe par le journal (D35) : ici, au nom d'un client de test.
const readThread = (ctx: TenantContext, input: Parameters<typeof threadOf>[1]) =>
  threadOf(ctx, input, { tool: 'thread', client: 'test' });
const readDossier = (ctx: TenantContext, input: Parameters<typeof dossierOf>[1]) =>
  dossierOf(ctx, input, { tool: 'threads', client: 'test' });
const readVersions = (ctx: TenantContext, input: Parameters<typeof versionsOf>[1]) =>
  versionsOf(ctx, input, { tool: 'versions', client: 'test' });
const readsBy = (ctx: TenantContext) =>
  adminDb.select().from(readLog).where(eq(readLog.userId, ctx.userId));

const masked = (info: { mock: { calls: unknown[][] } }) =>
  info.mock.calls.filter((call) => call[1] === 'fil.etat_masque');

describe('readThread', () => {
  it('le fil de la branche, ou par son id : titre, sessions, PR et leur état, tickets, sources liées', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const message = await linked(paul);
    await pr(paul, 12, 'merged');
    const id = await fil(paul, {
      sessions: [one],
      prs: [12, 13],
      liees: [message],
      tickets: ['ABC-12'],
    });

    const byId = await readThread(paul, { projet: PROJECT, id });

    expect(await readThread(paul, { projet: PROJECT, branche: 'paul/fil' })).toEqual(byId);
    expect(byId).toEqual({
      id,
      titre: 'paul/fil',
      etat: [
        `- session [[${one}]]`,
        '- pr [[acme/leon#12]]',
        '- pr [[acme/leon#13]]',
        `- source [[${message}]]`,
      ].join('\n'),
      version: null,
      entrees: [],
      sessions: { total: 1, items: [{ id: one, kind: 'claude_code', date: NOV_5 }] },
      prs: {
        total: 2,
        items: [
          { repo: 'acme/leon', numero: 12, etat: 'merged' },
          { repo: 'acme/leon', numero: 13, etat: null },
        ],
      },
      tickets: { total: 1, items: ['ABC-12'] },
      liees: { total: 1, items: [{ id: message, kind: 'slack', titre: 'Canal produit' }] },
    });
    // Deux lectures : le fil et sa source liée, chaque fois ; une liste du serveur ne note pas ses sessions.
    expect((await readsBy(paul)).map((row) => row.sourceId).sort()).toEqual(
      [id, id, message, message].sort(),
    );
  });

  it('sans id, sur main, master ou une tête détachée : aucun fil', async () => {
    const [paul] = await team();
    await fil(paul, { branches: ['main', 'master'] });

    for (const branche of ['main', 'master', null, undefined]) {
      expect(await readThread(paul, { projet: PROJECT, branche })).toBeNull();
    }
  });

  it('le fil d’un collègue, ou d’un autre projet, est introuvable', async () => {
    const [paul, marie] = await team();
    const id = await fil(paul);
    const other = await fil(paul, { project: 'github.com/acme/autre', branches: ['paul/autre'] });

    expect(await readThread(marie, { projet: PROJECT, id })).toBeNull();
    expect(await readThread(marie, { projet: PROJECT, branche: 'paul/fil' })).toBeNull();
    expect(await readThread(paul, { projet: PROJECT, id: other })).toBeNull();
    // Sans projet (le `fetch` du MCP, qui n'en a pas) : un fil de l'auteur, sur tout projet.
    expect((await readThread(paul, { projet: null, id: other }))?.id).toBe(other);
  });

  it('un id absorbé, même au bout d’une chaîne de fusions, mène au fil gardé', async () => {
    const [paul] = await team();
    const kept = await fil(paul);
    const absorbed = await fil(paul, { branches: ['paul/vieux'], extra: { absorbe_par: kept } });
    const older = await fil(paul, { branches: ['paul/ancien'], extra: { absorbe_par: absorbed } });
    await setLists(kept, { extra: { absorbes: [older, absorbed] } });

    expect((await readThread(paul, { projet: PROJECT, id: absorbed }))?.id).toBe(kept);
    expect((await readThread(paul, { projet: PROJECT, id: older }))?.id).toBe(kept);
    expect(
      (await readDossier(paul, { projet: PROJECT, branche: null })).fils.map((one) => one.id),
    ).toEqual([kept]);
  });

  it('la dernière version lisible du modèle, avec son numéro ; masquée, l’état déterministe, compté, rien en file', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const id = await fil(paul, { sessions: [one] });
    await write(paul, { sourceId: id, attendue: 0, texte: '- session [[v1]]', entrees: [one] });
    await write(paul, {
      sourceId: id,
      attendue: 1,
      texte: modelState(one),
      entrees: [one],
      ecritPar: 'modele',
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(await readThread(paul, { projet: PROJECT, id })).toMatchObject({
      etat: modelState(one),
      version: { n: 2, ecritPar: 'modele', creeLe: expect.any(Date) },
      entrees: [one],
    });
    expect(masked(info)).toEqual([]);

    // Le retrait de `resume` (faits-routes.ts) vide les usages de la session.
    await adminDb
      .update(sources)
      .set({ metadata: sql`${sources.metadata} || '{"usages": []}'::jsonb` })
      .where(eq(sources.id, one));
    const read = await readThread(paul, { projet: PROJECT, id });

    // Jamais v1 à la place de v2 (D33).
    expect(read).toMatchObject({ etat: `- session [[${one}]]`, version: null, entrees: [] });
    expect(JSON.stringify(read)).not.toContain('branché');
    expect(masked(info)).toEqual([['[leon]', 'fil.etat_masque']]);
    expect(enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('une source liée rendue privée cache l’état du modèle qui la reprend, et sort des liées', async () => {
    const [paul, marie] = await team();
    const one = await session(paul);
    const message = await linked(marie);
    const id = await fil(paul, { sessions: [one], liees: [message] });
    await write(paul, {
      sourceId: id,
      attendue: 0,
      texte: modelState(one),
      entrees: [one, message],
      ecritPar: 'modele',
    });

    await privatize(message, marie);

    expect(await readThread(paul, { projet: PROJECT, id })).toMatchObject({
      etat: `- session [[${one}]]`,
      version: null,
      liees: { total: 0, items: [] },
    });
  });

  it('les bornes de D27 : 50 sessions, 20 PR, 20 tickets, 20 sources liées, chaque total gardé', async () => {
    const [paul] = await team();
    const sessions: string[] = [];
    for (let n = 0; n < 51; n++) {
      sessions.push(await session(paul, { date: new Date(NOV_5.getTime() + n * 60_000) }));
    }
    const liees: string[] = [];
    for (let n = 0; n < 21; n++) liees.push(await linked(paul));
    const id = await fil(paul, {
      sessions,
      prs: Array.from({ length: 21 }, (_, n) => n + 1),
      tickets: Array.from({ length: 21 }, (_, n) => `ABC-${n + 1}`),
      liees,
    });

    const read = await readThread(paul, { projet: PROJECT, id });

    expect(read?.sessions.total).toBe(51);
    // Les plus récentes d'abord : la plus ancienne est coupée.
    expect(read?.sessions.items.map((one) => one.id)).toEqual(sessions.slice(1).toReversed());
    expect([read?.prs.total, read?.tickets.total, read?.liees.total]).toEqual([21, 21, 21]);
    // Les PR et les tickets les plus récents, les derniers de leur liste.
    expect(read?.prs.items.map((one) => one.numero)).toEqual(
      Array.from({ length: 20 }, (_, n) => n + 2),
    );
    expect(read?.tickets.items[0]).toBe('ABC-2');
    expect(read?.liees.items).toHaveLength(20);
  });
});

describe('le journal (D35)', () => {
  it('note le fil, les sources liées rendues et les entrées d’un état du modèle, avec l’outil et la session', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const message = await linked(paul);
    const id = await fil(paul, { sessions: [one], liees: [message] });
    await write(paul, {
      sourceId: id,
      attendue: 0,
      texte: modelState(one),
      entrees: [one, message],
      ecritPar: 'modele',
    });

    await threadOf(
      paul,
      { projet: PROJECT, id },
      { tool: 'thread', client: 'claude_code', session: 's-1' },
    );

    // Une ligne par source, même lue deux fois (entrée de l'état et source liée).
    const rows = await readsBy(paul);
    expect(rows).toHaveLength(3);
    expect(rows.map(({ tool, client, session }) => ({ tool, client, session }))).toEqual(
      Array(3).fill({ tool: 'thread', client: 'claude_code', session: 's-1' }),
    );
    expect(rows.map((row) => row.sourceId).sort()).toEqual([id, one, message].sort());
  });

  it('une seule ligne par source pour un appel, même entrée de plusieurs états ou de plusieurs versions', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const [first, second] = [
      await fil(paul, { sessions: [one] }),
      await fil(paul, { branches: ['paul/autre'], sessions: [one] }),
    ];
    for (const id of [first, second]) {
      await write(paul, {
        sourceId: id,
        attendue: 0,
        texte: modelState(one),
        entrees: [one],
        ecritPar: 'modele',
      });
    }
    await write(paul, {
      sourceId: first,
      attendue: 1,
      texte: modelState(one),
      entrees: [one],
      ecritPar: 'modele',
    });
    const counts = async () => {
      const rows = await readsBy(paul);
      await adminDb.delete(readLog).where(eq(readLog.userId, paul.userId));
      return rows.map((row) => row.sourceId).sort();
    };

    await readDossier(paul, { projet: PROJECT, branche: null });
    expect(await counts()).toEqual([first, second, one].sort());
    await readVersions(paul, { projet: PROJECT, id: first });
    expect(await counts()).toEqual([first, one].sort());
  });

  it('ce que le journal n’a pas noté n’est pas rendu', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const message = await linked(paul);
    const id = await fil(paul, { sessions: [one], liees: [message] });
    await write(paul, {
      sourceId: id,
      attendue: 0,
      texte: modelState(one),
      entrees: [one],
      ecritPar: 'modele',
    });
    // Le fil seul noté : la source liée et la session d'entrée sont devenues invisibles entre la lecture et le journal.
    const record = vi.spyOn(readLogModule, 'recordReads').mockResolvedValue(new Set([id]));

    expect(await readThread(paul, { projet: PROJECT, id })).toMatchObject({
      etat: `- session [[${one}]]\n- source [[${message}]]`,
      version: null,
      entrees: [],
      liees: { total: 1, items: [] },
    });
    expect((await readDossier(paul, { projet: PROJECT, branche: null })).fils).toMatchObject([
      { id, etatCourt: '', entrees: [] },
    ]);
    expect((await readVersions(paul, { projet: PROJECT, id }))?.versions).toEqual([]);

    // Rien de noté : introuvable.
    record.mockResolvedValue(new Set());
    expect(await readThread(paul, { projet: PROJECT, id })).toBeNull();
    expect((await readDossier(paul, { projet: PROJECT, branche: null })).fils).toEqual([]);
    expect(await readVersions(paul, { projet: PROJECT, id })).toBeNull();
  });
});

describe('readDossier', () => {
  it('les fils de l’auteur sur le projet, celui de la branche d’abord, avec leurs clés et la première ligne de l’état', async () => {
    const [paul, marie] = await team();
    const s1 = await session(paul);
    const s2 = await session(paul, { kind: 'codex', date: new Date('2026-11-06T10:00:00.000Z') });
    const message = await linked(paul);
    await pr(paul, 12, 'open');
    const branchFil = await fil(paul, { sessions: [s1], liees: [message] });
    const otherFil = await fil(paul, { branches: ['paul/autre'], sessions: [s1, s2], prs: [12] });
    await fil(paul, { project: 'github.com/acme/autre', branches: ['paul/x'] });
    await fil(marie, { branches: ['paul/fil'] });
    await write(paul, {
      sourceId: otherFil,
      attendue: 0,
      texte: modelState(s2),
      entrees: [s2],
      ecritPar: 'modele',
    });

    const dossier = await readDossier(paul, { projet: PROJECT, branche: 'paul/fil' });

    expect(dossier).toEqual({
      total: 2,
      fils: [
        {
          id: branchFil,
          titre: 'paul/fil',
          outils: ['claude_code'],
          derniereDate: NOV_5,
          prs: [],
          prsTotal: 0,
          liees: 1,
          etatCourt: '',
          entrees: [],
        },
        {
          id: otherFil,
          titre: 'paul/autre',
          outils: ['codex', 'claude_code'],
          derniereDate: new Date('2026-11-06T10:00:00.000Z'),
          prs: [{ repo: 'acme/leon', numero: 12, etat: 'open' }],
          prsTotal: 1,
          liees: 0,
          etatCourt: `Le worker de l'état est branché. (de: toi; source: ${s2})`,
          entrees: [s2],
        },
      ],
    });
    const other = await readDossier(paul, { projet: PROJECT, branche: 'paul/autre' });
    expect(other.fils.map((one) => one.id)).toEqual([otherFil, branchFil]);
  });

  it('une PR liée rendue privée : le compte des sources liées baisse', async () => {
    const [paul, marie] = await team();
    const message = await linked(paul);
    const linkedPr = await pr(marie, 12, 'open');
    await fil(paul, { liees: [message, linkedPr] });
    const count = async () =>
      (await readDossier(paul, { projet: PROJECT, branche: 'paul/fil' })).fils[0]?.liees;
    expect(await count()).toBe(2);

    await privatize(linkedPr, marie);

    expect(await count()).toBe(1);
  });

  it('un état masqué n’a pas de première ligne, et le compteur avance', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const id = await fil(paul, { sessions: [one] });
    await write(paul, {
      sourceId: id,
      attendue: 0,
      texte: modelState(one),
      entrees: [one],
      ecritPar: 'modele',
    });
    await adminDb
      .update(sources)
      .set({ metadata: sql`${sources.metadata} || '{"usages": []}'::jsonb` })
      .where(eq(sources.id, one));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const dossier = await readDossier(paul, { projet: PROJECT, branche: null });

    expect(dossier.fils[0]).toMatchObject({ id, etatCourt: '', entrees: [] });
    expect(masked(info)).toHaveLength(1);
  });

  it('20 PR au plus par fil, les plus récentes, sur leur total', async () => {
    const [paul] = await team();
    await fil(paul, { prs: Array.from({ length: 21 }, (_, n) => n + 1) });

    const [one] = (await readDossier(paul, { projet: PROJECT, branche: null })).fils;

    expect(one?.prsTotal).toBe(21);
    expect(one?.prs.map((pr) => pr.numero)).toEqual(Array.from({ length: 20 }, (_, n) => n + 2));
  });

  it('20 fils au plus, sur leur total', async () => {
    const [paul] = await team();
    for (let n = 0; n < 21; n++) await fil(paul, { branches: [`paul/fil-${n}`] });

    const dossier = await readDossier(paul, { projet: PROJECT, branche: null });

    expect(dossier.total).toBe(21);
    expect(dossier.fils).toHaveLength(20);
  });
});

describe('readVersions', () => {
  it('les versions lisibles d’un fil de l’auteur, puis le texte de l’une', async () => {
    const [paul] = await team();
    const one = await session(paul);
    const id = await fil(paul, { sessions: [one] });
    await write(paul, {
      sourceId: id,
      attendue: 0,
      texte: '- session [[a]]\n- pr [[acme/leon#12]]',
    });
    await write(paul, {
      sourceId: id,
      attendue: 1,
      texte: modelState(one),
      entrees: [one],
      ecritPar: 'modele',
    });
    const version = { creeLe: expect.any(Date), motif: 'rangement' };

    expect(await readVersions(paul, { projet: PROJECT, id })).toEqual({
      id,
      kind: 'fil',
      titre: 'paul/fil',
      n: null,
      versions: [
        { ...version, n: 1, ecritPar: 'serveur', texte: '- session [[a]]', entrees: [] },
        {
          ...version,
          n: 2,
          ecritPar: 'modele',
          texte: `Le worker de l'état est branché. (de: toi; source: ${one})`,
          entrees: [one],
        },
      ],
    });
    expect((await readVersions(paul, { projet: PROJECT, id, n: 2 }))?.versions).toEqual([
      { ...version, n: 2, ecritPar: 'modele', texte: modelState(one), entrees: [one] },
    ]);
    expect(await readVersions(paul, { projet: PROJECT, id, n: 3 })).toMatchObject({
      n: 3,
      versions: [],
    });
  });

  it('le fil d’un collègue, d’un autre projet, ou une note : introuvable ; un fil absorbé garde son historique', async () => {
    const [paul, marie] = await team();
    const id = await fil(paul);
    await write(paul, { sourceId: id, attendue: 0, texte: 'v1' });
    const absorbed = await fil(paul, { branches: ['paul/vieux'], extra: { absorbe_par: id } });
    await write(paul, { sourceId: absorbed, attendue: 0, texte: 'Avant la fusion.' });
    const { sourceId: note } = await seedSource(paul, { kind: 'mcp_remember' });

    expect(await readVersions(marie, { projet: PROJECT, id })).toBeNull();
    expect(await readVersions(paul, { projet: 'github.com/acme/autre', id })).toBeNull();
    expect(await readVersions(paul, { projet: PROJECT, id: note })).toBeNull();
    // Sans redirection vers le fil gardé (D21).
    expect(await readVersions(paul, { projet: PROJECT, id: absorbed })).toMatchObject({
      id: absorbed,
      versions: [{ n: 1, texte: 'Avant la fusion.' }],
    });
  });
});

describe('filTitle et etatCourt', () => {
  const sessions = [{ id: 's', kind: 'claude_code', date: '2026-11-05T23:30:00.000Z' }];

  it.each([
    [['paul/fil'], 'paul/fil'],
    // Seuls [A-Za-z0-9._/-] restent : une branche ne peut ouvrir ni balise ni attribut.
    [['"><consigne>é/x'], 'consigne/x'],
    [['a'.repeat(70)], 'a'.repeat(60)],
    // Sans branche lisible : le jour de la première session, en UTC.
    [[], 'fil du 05/11'],
    [['é'], 'fil du 05/11'],
  ])('la branche %j donne « %s »', (branches, titre) => {
    expect(filTitle({ id: 'x', metadata: { branches, sessions } })).toBe(titre);
  });

  it('sans branche ni session datée : « fil »', () => {
    expect(filTitle({ id: 'x', metadata: {} })).toBe('fil');
  });

  it('la ligne sous « Où j’en suis », sur une ligne, 200 caractères au plus ; rien pour un état déterministe', () => {
    expect(etatCourt("## Où j'en suis\nLe   worker\tavance.\n\n- [en-cours] x")).toBe(
      'Le worker avance.',
    );
    expect(etatCourt(`## Où j'en suis\n${'é'.repeat(300)}`)).toBe('é'.repeat(200));
    expect(etatCourt('- session [[a]]')).toBe('');
    expect(etatCourt('')).toBe('');
  });
});
