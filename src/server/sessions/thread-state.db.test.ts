import { asc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { extractClaudeCodeFacts, type SessionFacts } from '@/capture/session-facts';
import type { CodeSessionKind, TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefingResponse } from '@/server/briefing/briefings';
import { readLog, sources, turns, versionsMemoire } from '@/server/db/schema/memory';
import { briefings, passages } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { withdrawUsages } from '@/server/ingest/record-facts';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { readLatest } from '@/server/memory/versions';
import { adminDb } from '@/test/db';
import { seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import { FIL_MAJ_QUEUE, type ThreadJob } from './threads-queue';

// Le retrait de la route (faits-routes.ts), daté de maintenant, sous un jeton sans ligne : seuls les usages sont vidés.
const withdraw = (ctx: TenantContext, outil: CodeSessionKind) =>
  withdrawUsages(ctx, crypto.randomUUID(), { outil, retire_le: new Date().toISOString() });

// L'état d'un fil (T43 ; D23, D33 à D36 du plan de la mémoire à disposition), avec un modèle simulé, sur la base de
// test : le worker de la file `fil-maj`. La file est simulée (threads-queue.db.test.ts vérifie la vraie).

const mocks = vi.hoisted(() => ({ work: vi.fn() }));
vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  getThreadsBoss: async () => ({ work: mocks.work }),
}));

const { ENTREES_MAX, startFilStateWorker, updateFilState } = await import('./thread-state-worker');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function team(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { paul, marie };
}

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/fil',
  prs: [{ repo: 'acme/leon', numero: 12, par: 'pr-link' }],
  commits: ['1a2b3c4'],
  fichiers: ['src/server/sessions/thread-state.ts'],
  commandes: [],
  taches: [],
  erreurs: 0,
  externe: false,
  echanges: 6,
  debut: '2026-11-05T09:00:00.000Z',
  fin: '2026-11-05T10:00:00.000Z',
  ...extra,
});

type Tour = { role: TurnRole; text: string; injecte?: boolean | null };
const TOURS: Tour[] = [
  { role: 'user', text: 'On écrit l’état du fil en versions.', injecte: false },
  { role: 'assistant', text: 'Je branche le worker zéphyrin.' },
];

// Un résumé de plus pour la session : le tour `leon:resume:<n>`, que `metadata.resume.tour` désigne (resume-worker.ts).
async function addResume(
  owner: TenantContext,
  sourceId: string,
  n: number,
  text: string,
  createdAt?: Date,
) {
  const [row] = await adminDb
    .insert(turns)
    .values({
      tenantId: owner.tenantId,
      sourceId,
      externalId: `leon:resume:${n}`,
      role: 'document',
      text,
      ts: new Date('2026-11-05T10:00:00.000Z'),
      captureMode: 'manual',
      acl: [owner.userId],
      ...(createdAt ? { createdAt } : {}),
    })
    .returning({ id: turns.id });
  await adminDb
    .update(sources)
    .set({
      metadata: sql`${sources.metadata} || jsonb_build_object('resume', jsonb_build_object('dernier_tour', 'x', 'tour', ${n}::int))`,
    })
    .where(eq(sources.id, sourceId));
  return row?.id ?? '';
}

// Une session de code de l'auteur, avec l'usage `resume` et un premier résumé, sauf ce que `input` remplace.
async function codeSession(
  owner: TenantContext,
  input: {
    kind?: CodeSessionKind;
    usages?: string[];
    externe?: boolean;
    tours?: Tour[];
    resume?: string | null;
    faits?: SessionFacts;
  } = {},
) {
  const tours = input.tours ?? TOURS;
  const start = Date.UTC(2026, 10, 5, 9);
  const seeded = await seedRun(owner, {
    kind: input.kind ?? 'claude_code',
    status: 'done',
    metadata: {
      project: PROJECT,
      faits: input.faits ?? facts({ externe: input.externe ?? false }),
      usages: input.usages ?? ['resume'],
    },
    turns: tours.map((tour, index) => ({
      role: tour.role,
      text: tour.text,
      ts: new Date(start + index * 60_000),
    })),
    lastTurnAt: new Date(start + tours.length * 60_000),
  });
  for (const [index, tour] of tours.entries()) {
    if (tour.injecte === undefined || tour.injecte === null) continue;
    await adminDb
      .update(turns)
      .set({ injecte: tour.injecte })
      .where(eq(turns.id, seeded.turnIds[index] ?? ''));
  }
  const resume =
    input.resume === null
      ? null
      : await addResume(
          owner,
          seeded.sourceId,
          1,
          input.resume ?? "## Où j'en suis\nL’état du fil se branche.",
        );
  return { id: seeded.sourceId, turnIds: seeded.turnIds, resume };
}

// Une source qu'un fil relie : un message Slack visible de l'équipe, écrit par l'équipe d'après l'outil, par défaut.
async function linked(
  owner: TenantContext,
  input: {
    kind?: 'slack' | 'intercom' | 'mcp_remember';
    text?: string;
    acl?: string[];
    nature?: string;
    side?: 'team' | 'external' | null;
  } = {},
) {
  const seeded = await seedRun(owner, {
    kind: input.kind ?? 'slack',
    acl: input.acl ?? [owner.tenantId],
    status: 'done',
    metadata: { nature: input.nature ?? 'fil' },
    turns: [{ text: input.text ?? 'On garde Haiku pour les fils.' }],
  });
  await adminDb
    .update(turns)
    .set({ authorSide: input.side === undefined ? 'team' : input.side })
    .where(eq(turns.sourceId, seeded.sourceId));
  return seeded.sourceId;
}

// Le fil de l'auteur, avec ces sessions, PR et sources liées, comme le rangement et la liaison l'écrivent.
async function fil(owner: TenantContext, sessions: string[], liees: string[] = []) {
  const id = await seedThread(owner);
  await setLists(id, sessions, liees);
  return id;
}
const setLists = (id: string, sessions: string[], liees: string[]) =>
  adminDb
    .update(sources)
    .set({
      metadata: sql`${sources.metadata} || ${JSON.stringify({
        project: PROJECT,
        branches: ['paul/fil'],
        sessions: sessions.map((one) => ({
          id: one,
          kind: 'claude_code',
          date: '2026-11-05T10:00:00.000Z',
        })),
        prs: [{ repo: 'acme/leon', numero: 12, par: 'pr-link' }],
        liees: liees.map((one) => ({ id: one, cle: 'lien' })),
      })}::jsonb`,
    })
    .where(eq(sources.id, id));

const job = (owner: TenantContext, filId: string): ThreadJob => ({
  tenantId: owner.tenantId,
  sourceId: filId,
  ownerUserId: owner.userId,
});

const versions = (filId: string) =>
  adminDb
    .select()
    .from(versionsMemoire)
    .where(eq(versionsMemoire.sourceId, filId))
    .orderBy(asc(versionsMemoire.n));

const answer = (text: string) => createFakeLlm({ texts: [text] });
const promptOf = (llm: { calls: Array<{ messages: Array<{ content: string }> }> }) =>
  llm.calls[0]?.messages[0]?.content ?? '';
const etat = (sessionId: string) =>
  `## Où j'en suis\nLe worker de l'état du fil est branché. (source: ${sessionId})`;

describe('updateFilState', () => {
  it('une session resume nouvelle : un appel, une version du modèle avec son étape, son modèle et ses entrées', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const message = await linked(paul);
    const filId = await fil(paul, [one.id], [message]);
    const [typed, agent] = one.turnIds;
    const llm = answer(
      [
        etat(one.id),
        '',
        `- [en-cours] Les tests (de: toi; source: ${agent})`,
        `- [décision] L'état s'écrit en versions (source: ${typed})`,
      ].join('\n'),
    );

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.step).toBe('fil');
    // Une session qui n'est pas externe : son récit entre, ses tours marqués (D36).
    expect(promptOf(llm)).toContain(`<tour id="${typed}" de="utilisateur" preuve="oui"`);
    expect(promptOf(llm)).toContain(`<tour id="${agent}" de="agent"`);
    expect(promptOf(llm)).toContain('L’état du fil se branche.');
    expect(promptOf(llm)).toContain(
      `<source id="${message}" outil="slack" type="fil" de="connecteur" preuve="oui"`,
    );
    const [version, ...others] = await versions(filId);
    expect(others).toEqual([]);
    expect(version).toMatchObject({
      n: 1,
      ecritPar: 'modele',
      etape: 'fil',
      modele: 'claude-haiku-5-5',
      motif: 'rangement',
      acl: [paul.userId],
    });
    expect(version?.entrees.sort()).toEqual([one.id, message].sort());
    expect(version?.tours.sort()).toEqual([typed, agent].sort());
    expect(version?.texte).toBe(
      [
        "## Où j'en suis",
        `Le worker de l'état du fil est branché. (de: agent; source: ${one.id})`,
        '',
        `- [en-cours] Les tests (de: agent; source: ${agent})`,
        `- [décision] L'état s'écrit en versions (de: toi; source: ${typed})`,
      ].join('\n'),
    );
    expect((await readLatest(paul, filId)).version?.n).toBe(1);
  });

  it('sans résumé nouveau depuis le dernier état : aucun second appel', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) });
    const llm = answer(etat(one.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('inchange');

    expect(llm.calls).toEqual([]);
    expect(await versions(filId)).toHaveLength(1);
  });

  it('une session écartée du condensé (plus de 20) : son résumé n’est pas pris, et seul il ne fait pas d’appel', async () => {
    const { paul } = await team();
    const recent = [];
    for (let i = 0; i < 20; i += 1) recent.push(await codeSession(paul));
    const old = await codeSession(paul);
    // La plus ancienne : la 21e, hors des 20 sessions du condensé.
    await adminDb
      .update(sources)
      .set({ lastTurnAt: new Date('2026-10-01T09:00:00.000Z') })
      .where(eq(sources.id, old.id));
    const filId = await fil(paul, [old.id, ...recent.map((one) => one.id)]);

    expect(await updateFilState(job(paul, filId), { llm: answer(etat(recent[0]?.id ?? '')) })).toBe(
      'modele',
    );
    const [row] = await adminDb
      .select({ metadata: sources.metadata })
      .from(sources)
      .where(eq(sources.id, filId));
    const pris =
      (row?.metadata.etat_session as { tours?: Record<string, string> } | undefined)?.tours ?? {};
    expect(Object.keys(pris).sort()).toEqual(recent.map((one) => one.id).sort());

    // La seule session nouvelle n'entre pas au condensé : aucun appel.
    const llm = answer(etat(recent[0]?.id ?? ''));
    expect(await updateFilState(job(paul, filId), { llm })).toBe('inchange');
    expect(llm.calls).toEqual([]);
  });

  it('second état, après un nouveau résumé : v2, et ni l’un ni l’autre dans la recherche', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await updateFilState(job(paul, filId), {
      llm: answer(`## Où j'en suis\nPremier état zorglub. (source: ${one.id})`),
    });
    await addResume(paul, one.id, 2, "## Où j'en suis\nLa session a repris.");
    const llm = answer(`## Où j'en suis\nSecond état. (source: ${one.id})`);

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(llm.calls).toHaveLength(1);
    expect(promptOf(llm)).toContain('La session a repris.');
    expect((await versions(filId)).map((row) => row.n)).toEqual([1, 2]);
    expect((await readLatest(paul, filId)).version?.texte).toContain('Second état.');
    // Ni tour ni passage pour le fil : la recherche n'a rien à y trouver, ni l'ancien état ni le nouveau (D35).
    expect(await adminDb.select().from(turns).where(eq(turns.sourceId, filId))).toEqual([]);
    expect(await adminDb.select().from(passages).where(eq(passages.sourceId, filId))).toEqual([]);
  });

  // La date d'écriture d'un tour est le début de sa transaction (insertNewTurns) : un résumé commencé avant celui
  // d'une autre session, mais validé après que le worker l'a lu, a une date plus ancienne et reste nouveau.
  it('un résumé daté d’avant le dernier pris en compte, mais nouveau : un appel', async () => {
    const { paul } = await team();
    const late = await codeSession(paul, { resume: null });
    const first = await codeSession(paul);
    const filId = await fil(paul, [late.id, first.id]);
    await updateFilState(job(paul, filId), { llm: answer(etat(first.id)) });
    await addResume(
      paul,
      late.id,
      1,
      "## Où j'en suis\nLe résumé validé en retard.",
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const llm = answer(etat(late.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(llm.calls).toHaveLength(1);
    expect(promptOf(llm)).toContain('Le résumé validé en retard.');
  });

  it('fil dont aucune session n’a l’usage resume : aucun appel, l’état déterministe écrit par le serveur', async () => {
    const { paul } = await team();
    const one = await codeSession(paul, { usages: [] });
    const message = await linked(paul);
    const filId = await fil(paul, [one.id], [message]);
    const llm = answer('jamais lu');

    expect(await updateFilState(job(paul, filId), { llm })).toBe('serveur');

    expect(llm.calls).toEqual([]);
    const [version] = await versions(filId);
    expect(version).toMatchObject({ n: 1, ecritPar: 'serveur', etape: null, modele: null });
    expect(version?.texte).toBe(
      [`- session [[${one.id}]]`, '- pr [[acme/leon#12]]', `- source [[${message}]]`].join('\n'),
    );
    expect(version?.entrees.sort()).toEqual([one.id, message].sort());
  });

  it('fil mixte : rien de la session sans l’usage dans le condensé', async () => {
    const { paul } = await team();
    const withUsage = await codeSession(paul);
    const without = await codeSession(paul, {
      kind: 'codex',
      usages: [],
      tours: [{ role: 'user', text: 'Texte privé de Codex.', injecte: false }],
      resume: 'Résumé privé de Codex.',
    });
    const filId = await fil(paul, [withUsage.id, without.id]);
    const llm = answer(etat(withUsage.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain(withUsage.id);
    expect(promptOf(llm)).not.toContain(without.id);
    expect(promptOf(llm)).not.toContain('privé de Codex');
    expect((await versions(filId))[0]?.entrees).toEqual([withUsage.id]);
  });

  // D23, T51 : les coulisses du lot 14 n'entrent jamais au condensé, même d'une session non externe avec l'usage resume.
  it('aucun tour des coulisses n’entre au condensé', async () => {
    const { paul } = await team();
    const one = await codeSession(paul, {
      tours: [
        ...TOURS,
        { role: 'raisonnement', text: 'Coulisse raisonnement.' },
        { role: 'sous_agent', text: '[rapport]\nCoulisse sous-agent.' },
        { role: 'appel_outil', text: 'Read · src/coulisse.ts · ok' },
      ],
    });
    const filId = await fil(paul, [one.id]);
    const llm = answer(etat(one.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain('Je branche le worker zéphyrin.');
    expect(promptOf(llm)).not.toContain('oulisse');
  });

  it('après un retrait, une session envoyée avant lui, même ancienne, n’entre plus au condensé', async () => {
    const { paul } = await team();
    const old = await codeSession(paul, {
      kind: 'codex',
      tours: [{ role: 'user', text: 'Ancien récit de Codex.', injecte: false }],
      resume: 'Ancien résumé de Codex.',
    });
    const fresh = await codeSession(paul);
    const filId = await fil(paul, [old.id, fresh.id]);
    await withdraw(paul, 'codex');
    const llm = answer(etat(fresh.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).not.toContain(old.id);
    expect(promptOf(llm)).not.toContain('Ancien');
  });

  it('une session avec resume, sans tour marqué (une CLI d’avant la route du retrait), n’entre pas au condensé', async () => {
    const { paul } = await team();
    const avant = await codeSession(paul, {
      kind: 'codex',
      tours: [
        { role: 'user', text: 'Récit d’avant la marque.' },
        { role: 'assistant', text: 'Réponse d’avant la marque.' },
      ],
      resume: 'Résumé d’avant la marque.',
    });
    const filId = await fil(paul, [avant.id]);
    const seule = answer('jamais lu');

    expect(await updateFilState(job(paul, filId), { llm: seule })).toBe('serveur');
    expect(seule.calls).toEqual([]);

    const fresh = await codeSession(paul);
    await setLists(filId, [avant.id, fresh.id], []);
    const llm = answer(etat(fresh.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');
    expect(promptOf(llm)).not.toContain(avant.id);
    expect(promptOf(llm)).not.toContain('d’avant la marque');
    expect((await versions(filId))[1]?.entrees).toEqual([fresh.id]);
  });

  it('l’usage resume retiré pendant l’appel : rien n’est écrit', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const base = answer(etat(one.id));
    const llm: Llm = {
      ...base,
      async *streamText(request) {
        await withdraw(paul, 'claude_code');
        yield* base.streamText(request);
      },
    };

    expect(await updateFilState(job(paul, filId), { llm })).toBe('sans-objet');

    expect(await versions(filId)).toEqual([]);
  });

  it('deux mises à jour concurrentes depuis v0 : une seule v1, l’autre dépassée', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    // Les deux tâches ont lu v0 et bâti leur condensé avant que l'une n'écrive.
    let entered = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated = (text: string): Llm => {
      const base = answer(text);
      return {
        ...base,
        async *streamText(request) {
          entered += 1;
          if (entered === 2) release();
          await gate;
          yield* base.streamText(request);
        },
      };
    };

    const results = await Promise.all([
      updateFilState(job(paul, filId), { llm: gated(etat(one.id)) }),
      updateFilState(job(paul, filId), { llm: gated(etat(one.id)) }),
    ]);

    expect(results.sort()).toEqual(['depassee', 'modele']);
    expect((await versions(filId)).map((row) => row.n)).toEqual([1]);
  });

  it('modèle en échec : l’ancien état est gardé, aucune version écrite', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) });
    await addResume(paul, one.id, 2, 'Nouveau résumé.');
    const llm: Llm = {
      ...answer(''),
      async *streamText() {
        yield* [];
        throw new LlmError('panne');
      },
    };

    await expect(updateFilState(job(paul, filId), { llm })).rejects.toThrow(LlmError);

    expect((await versions(filId)).map((row) => row.n)).toEqual([1]);
    expect((await readLatest(paul, filId)).version?.ecritPar).toBe('modele');
  });

  it('sans modèle réglé : l’état déterministe, puis une version du serveur par session de plus', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);

    expect(await updateFilState(job(paul, filId), { llm: null })).toBe('serveur');
    expect(await updateFilState(job(paul, filId), { llm: null })).toBe('inchange');
    const two = await codeSession(paul);
    await setLists(filId, [one.id, two.id], []);
    expect(await updateFilState(job(paul, filId), { llm: null })).toBe('serveur');

    const rows = await versions(filId);
    expect(rows.map((row) => [row.n, row.ecritPar])).toEqual([
      [1, 'serveur'],
      [2, 'serveur'],
    ]);
    expect(rows[1]?.texte).toContain(`- session [[${two.id}]]`);
  });

  it('dix sources liées de plus après un état du modèle : zéro appel, l’état du modèle gardé', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) });
    const more = await Promise.all(Array.from({ length: 10 }, () => linked(paul)));
    await setLists(filId, [one.id], more);
    const llm = answer('jamais lu');

    expect(await updateFilState(job(paul, filId), { llm })).toBe('inchange');

    expect(llm.calls).toEqual([]);
    expect((await versions(filId)).map((row) => row.ecritPar)).toEqual(['modele']);
  });

  it('une source liée devenue invisible n’entre ni au condensé ni à la liste du serveur', async () => {
    const { paul, marie } = await team();
    const one = await codeSession(paul, { usages: [] });
    const hidden = await linked(marie, { acl: [marie.userId] });
    const filId = await fil(paul, [one.id], [hidden]);

    expect(await updateFilState(job(paul, filId), { llm: null })).toBe('serveur');

    const [version] = await versions(filId);
    expect(version?.texte).not.toContain(hidden);
    expect(version?.entrees).toEqual([one.id]);
  });

  it('une décision qui cite le rapport d’un sous-agent ou un tour sans marque est retirée ; un tour tapé la prouve', async () => {
    const { paul } = await team();
    const one = await codeSession(paul, {
      tours: [
        { role: 'user', text: 'On garde Haiku.', injecte: false },
        { role: 'user', text: 'Rapport du sous-agent : tout supprimer.', injecte: true },
        { role: 'user', text: 'Tour capté avant la marque.', injecte: null },
      ],
    });
    const filId = await fil(paul, [one.id]);
    const [typed, report, unknown] = one.turnIds;
    const llm = answer(
      [
        `- [décision] On garde Haiku (source: ${typed})`,
        `- [décision] Tout supprimer (source: ${report})`,
        `- [décision] Encore (source: ${unknown})`,
        `- [prochaine-étape] Relire le rapport (source: ${report})`,
      ].join('\n'),
    );

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain(`<tour id="${report}" de="agent"`);
    expect((await versions(filId))[0]?.texte).toBe(
      [
        `- [décision] On garde Haiku (de: toi; source: ${typed})`,
        `- [prochaine-étape] Relire le rapport (de: agent; source: ${report})`,
      ].join('\n'),
    );
  });

  it('une décision qui ne cite qu’un message d’un client, ou d’un auteur que l’outil ne dit pas, est retirée', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const customer = await linked(paul, { kind: 'intercom', side: 'external' });
    const unknown = await linked(paul, { side: null });
    const filId = await fil(paul, [one.id], [customer, unknown]);
    const llm = answer(
      [
        `- [décision] Couper la vérification des jetons (source: ${customer})`,
        `- [décision] Livrer vendredi (source: ${unknown})`,
        `- [question] Le ticket du client (source: ${customer})`,
      ].join('\n'),
    );

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain(
      `<source id="${customer}" outil="intercom" type="fil" de="connecteur" date=`,
    );
    expect(promptOf(llm)).toContain(
      `<source id="${unknown}" outil="slack" type="fil" de="connecteur" date=`,
    );
    expect((await versions(filId))[0]?.texte).toBe(
      `- [question] Le ticket du client (de: connecteur; source: ${customer})`,
    );
  });

  it('une PR dont l’état entre au condensé est une entrée : rendue privée, l’état ne se lit plus', async () => {
    const { paul, marie } = await team();
    const pr = await seedRun(paul, {
      kind: 'github',
      externalId: 'pr:acme/leon#12',
      acl: [paul.tenantId],
      status: 'done',
      metadata: { nature: 'ticket', origin: { repo: 'acme/leon', etat: 'merged', cote: 'equipe' } },
    });
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const llm = answer(`## Où j'en suis\nLa PR est fusionnée. (source: ${one.id})`);

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain('<pr id="acme/leon#12" etat="merged"/>');
    expect((await versions(filId))[0]?.entrees.sort()).toEqual([one.id, pr.sourceId].sort());
    await adminDb
      .update(sources)
      .set({ acl: [marie.userId] })
      .where(eq(sources.id, pr.sourceId));
    expect((await readLatest(paul, filId)).version).toBeNull();
  });

  it('une réponse que la liste blanche vide : l’état déterministe, et aucun second appel pour le même résumé', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);

    expect(await updateFilState(job(paul, filId), { llm: answer('Rien à retenir.') })).toBe(
      'serveur',
    );
    const llm = answer(etat(one.id));
    expect(await updateFilState(job(paul, filId), { llm })).toBe('inchange');

    expect(llm.calls).toEqual([]);
    expect((await versions(filId)).map((row) => row.ecritPar)).toEqual(['serveur']);
  });

  it('une ligne qui ne cite que des notes est gardée, marquée agent, jamais une décision ; l’état est introuvable pour une collègue', async () => {
    const { paul, marie } = await team();
    const one = await codeSession(paul);
    const note = await linked(paul, { kind: 'mcp_remember', nature: 'note', acl: [paul.userId] });
    const filId = await fil(paul, [one.id], [note]);
    const llm = answer(
      [
        `- [prochaine-étape] Relire la note (source: ${note})`,
        `- [décision] Ce que dit la note (source: ${note})`,
      ].join('\n'),
    );

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain(
      `<source id="${note}" outil="mcp_remember" type="note" de="agent (note)"`,
    );
    expect((await versions(filId))[0]?.texte).toBe(
      `- [prochaine-étape] Relire la note (de: agent; source: ${note})`,
    );
    expect(await readLatest(marie, filId)).toEqual({ n: 0, version: null });
  });

  it('n’écrit jamais le fil d’un autre : le job d’une collègue sur mon fil ne fait rien', async () => {
    const { paul, marie } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const llm = answer(etat(one.id));

    expect(await updateFilState(job(marie, filId), { llm })).toBe('sans-objet');

    expect(llm.calls).toEqual([]);
    expect(await versions(filId)).toEqual([]);
  });

  it('un fil absorbé par une fusion ne change plus', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await adminDb
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || jsonb_build_object('absorbe_par', ${filId}::text)`,
      })
      .where(inArray(sources.id, [filId]));

    expect(await updateFilState(job(paul, filId), { llm: null })).toBe('sans-objet');
    expect(await versions(filId)).toEqual([]);
  });

  it('un fil absorbé par une fusion pendant l’appel : rien n’est écrit', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const keeper = await seedThread(paul);
    const base = answer(etat(one.id));
    const llm: Llm = {
      ...base,
      async *streamText(request) {
        await adminDb
          .update(sources)
          .set({
            metadata: sql`${sources.metadata} || jsonb_build_object('absorbe_par', ${keeper}::text)`,
          })
          .where(eq(sources.id, filId));
        yield* base.streamText(request);
      },
    };

    expect(await updateFilState(job(paul, filId), { llm })).toBe('sans-objet');

    expect(await versions(filId)).toEqual([]);
  });
});

// Les sources lues pendant les sessions du condensé (T44 ; D35, décision du 10/11) : entre le premier et le dernier tour
// d'une session (ici 09:00, et 10:00 pour son résumé, le 05/11), à 10 minutes près, ou notées avec son id, elles
// entrent aux entrées de l'état du modèle. Rendues invisibles, l'état ne se lit plus.
describe('updateFilState : les sources lues pendant les sessions', () => {
  const at = (iso: string) => new Date(iso);
  const IN_WINDOW = at('2026-11-05T09:05:00.000Z');
  // Une lecture au journal, comme recordReads l'écrit (ACL de la source), à la date voulue.
  const read = async (
    reader: TenantContext,
    sourceId: string,
    input: { tool?: string; when?: Date; session?: string | null; acl?: string[] } = {},
  ) => {
    await adminDb.insert(readLog).values({
      tenantId: reader.tenantId,
      userId: reader.userId,
      client: 'cli',
      tool: (input.tool ?? 'search') as 'search',
      sourceId,
      acl: input.acl ?? [reader.tenantId],
      session: input.session ?? null,
      at: input.when ?? IN_WINDOW,
    });
  };
  const sessionExternalId = async (id: string) =>
    (await adminDb.select({ id: sources.externalId }).from(sources).where(eq(sources.id, id)))[0]
      ?.id ?? '';

  it('les lectures de l’auteur dans la fenêtre de la session, de chaque outil qui rend du texte, entrent aux entrées', async () => {
    const { paul, marie } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const lues: Record<string, string> = {};
    for (const tool of ['search', 'fetch', 'thread', 'threads', 'versions', 'briefing']) {
      lues[tool] = await linked(paul);
      await read(paul, lues[tool] ?? '', { tool });
    }
    const early = await linked(paul);
    await read(paul, early, { when: at('2026-11-05T08:49:00.000Z') });
    const late = await linked(paul);
    await read(paul, late, { when: at('2026-11-05T10:11:00.000Z') });
    const edge = await linked(paul);
    await read(paul, edge, { when: at('2026-11-05T10:10:00.000Z') });
    const byMarie = await linked(marie);
    await read(marie, byMarie);

    expect(await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) })).toBe('modele');

    const [version] = await versions(filId);
    expect(version?.entrees.sort()).toEqual([one.id, edge, ...Object.values(lues)].sort());
  });

  it('une lecture notée avec l’id de la session entre aussi, même hors de la fenêtre', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const lue = await linked(paul);
    await read(paul, lue, {
      tool: 'thread',
      when: at('2026-11-06T12:00:00.000Z'),
      session: await sessionExternalId(one.id),
    });

    expect(await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) })).toBe('modele');

    expect((await versions(filId))[0]?.entrees.sort()).toEqual([one.id, lue].sort());
  });

  // Repris de T43 : une source lue par `leon search`, rendue privée par aligner_sources_github() (0048), avant que
  // l'état s'écrive (le journal ne se lit plus sous RLS) ou après.
  it.each(['avant', 'après'])(
    'une source lue par `leon search` puis rendue privée %s l’écriture de l’état : l’état du modèle ne se lit plus',
    async (moment) => {
      const { paul, marie } = await team();
      const perso = await seedRun(marie, {
        kind: 'github',
        externalId: 'pr:marie/perso#3',
        acl: [marie.tenantId],
        status: 'done',
        metadata: { nature: 'ticket', origin: { repo: 'marie/perso', cote: 'equipe' } },
      });
      const one = await codeSession(paul);
      const filId = await fil(paul, [one.id]);
      await read(paul, perso.sourceId);
      const privatize = () =>
        withTenant(marie, (tx) => tx.execute(sql`select aligner_sources_github()`));

      if (moment === 'avant') await privatize();
      expect(await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) })).toBe('modele');
      if (moment === 'après') await privatize();

      expect((await versions(filId))[0]?.entrees).toContain(perso.sourceId);
      expect((await readLatest(paul, filId)).version).toBeNull();
    },
  );

  // Le point du matin du bloc de démarrage, noté avec l'id de la session (context-routes.ts) : ses sources entrent aux
  // entrées, même lues des jours après le dernier tour.
  it('une source du point lue par le bloc de démarrage, puis rendue privée : l’état du modèle ne se lit plus', async () => {
    const { paul, marie } = await team();
    const perso = await seedRun(marie, {
      kind: 'github',
      externalId: 'pr:marie/perso#4',
      acl: [marie.tenantId],
      status: 'done',
      metadata: { nature: 'ticket', origin: { repo: 'marie/perso', cote: 'equipe' } },
    });
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    await adminDb.insert(briefings).values({
      tenantId: paul.tenantId,
      userId: paul.userId,
      project: PROJECT,
      markdown: '# Point du matin\n- Marie a demandé la revue [1].',
      sourceIds: [perso.sourceId],
      preparedAt: new Date(),
      stale: false,
      acl: [paul.userId],
    });
    const point = await briefingResponse(paul, PROJECT, {
      modelReady: false,
      client: 'cli',
      session: await sessionExternalId(one.id),
    });
    expect(point.projet).toBe(PROJECT);

    expect(await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) })).toBe('modele');
    await withTenant(marie, (tx) => tx.execute(sql`select aligner_sources_github()`));

    expect((await versions(filId))[0]?.entrees).toContain(perso.sourceId);
    expect((await readLatest(paul, filId)).version).toBeNull();
  });

  // Les lectures en cascade d'un fil à l'autre : au-delà du plafond, l'état reste déterministe, et rien du modèle ne
  // s'écrit.
  it('plus de ENTREES_MAX sources lues pendant la session : l’état du serveur, jamais celui du modèle', async () => {
    const { paul } = await team();
    const one = await codeSession(paul);
    const filId = await fil(paul, [one.id]);
    const lues = await adminDb
      .insert(sources)
      .values(
        Array.from({ length: ENTREES_MAX + 1 }, () => ({
          tenantId: paul.tenantId,
          kind: 'slack' as const,
          externalId: crypto.randomUUID(),
          ownerUserId: paul.userId,
          acl: [paul.tenantId],
        })),
      )
      .returning({ id: sources.id });
    await adminDb.insert(readLog).values(
      lues.map(({ id }) => ({
        tenantId: paul.tenantId,
        userId: paul.userId,
        client: 'cli',
        tool: 'threads' as const,
        sourceId: id,
        acl: [paul.tenantId],
        at: IN_WINDOW,
      })),
    );
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(await updateFilState(job(paul, filId), { llm: answer(etat(one.id)) })).toBe('serveur');

    expect((await versions(filId)).map((one) => one.ecritPar)).toEqual(['serveur']);
    expect(info.mock.calls.filter((call) => call[1] === 'fil.entrees_trop')).toHaveLength(1);
    info.mockRestore();
  });

  // Repris de T43 : lire Leon ne rend pas la session externe (D36), son récit entre au condensé.
  it('dans une session qui a lu `leon thread` et l’outil thread de Leon, les tours de l’utilisateur entrent au condensé, ceux de l’agent marqués', async () => {
    const { paul } = await team();
    const transcript = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'b1',
              name: 'Bash',
              input: { command: '~/.leon/bin/leon thread' },
            },
            { type: 'tool_use', id: 'm1', name: 'mcp__leon__thread', input: { projet: PROJECT } },
          ],
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n');
    const faits = extractClaudeCodeFacts(transcript, null, true);
    expect(faits.externe).toBe(false);
    const one = await codeSession(paul, { faits: { ...facts(), externe: faits.externe } });
    const filId = await fil(paul, [one.id]);
    const [typed, agent] = one.turnIds;
    const llm = answer(etat(one.id));

    expect(await updateFilState(job(paul, filId), { llm })).toBe('modele');

    expect(promptOf(llm)).toContain(`<tour id="${typed}" de="utilisateur" preuve="oui"`);
    expect(promptOf(llm)).toContain(`<tour id="${agent}" de="agent"`);
  });
});

describe('startFilStateWorker', () => {
  it('écoute la file fil-maj, une fois', async () => {
    await Promise.all([startFilStateWorker({ llm: null }), startFilStateWorker({ llm: null })]);

    expect(mocks.work).toHaveBeenCalledTimes(1);
    expect(mocks.work.mock.calls[0]?.[0]).toBe(FIL_MAJ_QUEUE);
  });
});
