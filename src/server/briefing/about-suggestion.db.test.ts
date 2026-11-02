import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { sources } from '@/server/db/schema/memory';
import { aboutSuggestions } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminDb, adminPool } from '@/test/db';
import { seedConnection } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import { readAbout } from './about';
import { gatherAboutMaterial } from './about-material';
import {
  ABOUT_MIN_SOURCES,
  closeAboutSuggestion,
  listAboutCandidates,
  proposeAbout,
  readAboutSuggestion,
} from './about-suggestion';

// `readAbout` passe par un espion qui rappelle le vrai : un test compte ses appels (la lecture du Chat ne doit pas le
// lire quand aucune proposition n'est ouverte).
vi.mock('./about', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./about')>();
  return { ...actual, readAbout: vi.fn(actual.readAbout) };
});

// La proposition « About you », de bout en bout sous les droits de la personne : la matière (ses seules sources),
// un seul appel au faux modèle, la ligne écrite ; puis la liste de qui est prêt, lue hors sécurité par ligne.

const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const tenantIds: string[] = [];

// Un espace neuf : Alice, et Bob qui ne doit rien lui prêter.
async function newPair(): Promise<[TenantContext, TenantContext]> {
  const team = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  return team.members as [TenantContext, TenantContext];
}

afterAll(async () => {
  await adminPool.query('delete from about_suggestions where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await dropTeams(tenantIds);
});

const rowsOf = (ctx: TenantContext) =>
  adminDb.select().from(aboutSuggestions).where(eq(aboutSuggestions.userId, ctx.userId));

const setAbout = (ctx: TenantContext, about: string | null) =>
  adminDb.update(users).set({ about }).where(eq(users.id, ctx.userId));

// Les sources d'Alice (github à l'espace, gmail à elle seule, claude_code), celle d'elle que la sécurité par ligne
// cache (acl de Bob), et celle de Bob.
async function seedPeople(alice: TenantContext, bob: TenantContext) {
  const github = await seedRun(alice, {
    kind: 'github',
    acl: [alice.tenantId],
    title: '#22 Renouveler le jeton',
    metadata: { nature: 'ticket' },
    turns: [
      { text: 'Je corrige le renouvellement du jeton.', ts: ago(2 * HOUR), role: 'participant' },
    ],
    lastTurnAt: ago(2 * HOUR),
    status: 'done',
  });
  const gmail = await seedRun(alice, {
    kind: 'gmail',
    title: 'Point budget du trimestre',
    metadata: { nature: 'mail' },
    turns: [{ text: 'Voici le budget du trimestre.', ts: ago(3 * HOUR), role: 'participant' }],
    lastTurnAt: ago(3 * HOUR),
    status: 'done',
  });
  await seedRun(alice, {
    kind: 'notion',
    acl: [bob.userId],
    title: 'Page cachée par la sécurité par ligne',
    turns: [{ text: 'Texte réservé à Bob.', ts: ago(HOUR) }],
    lastTurnAt: ago(HOUR),
    status: 'done',
  });
  await seedRun(alice, {
    kind: 'claude_code',
    title: 'Session privée avec l’assistant',
    turns: [{ text: 'Texte d’une conversation avec l’assistant.', ts: ago(HOUR) }],
    lastTurnAt: ago(HOUR),
    status: 'done',
  });
  await seedRun(bob, {
    kind: 'linear',
    acl: [bob.tenantId],
    title: 'LIN-4 Démo client',
    turns: [{ text: 'Texte de Bob.', ts: ago(HOUR) }],
    lastTurnAt: ago(HOUR),
    status: 'done',
  });
  return { githubId: github.sourceId, gmailId: gmail.sourceId };
}

describe('proposeAbout', () => {
  it('ne donne au modèle que les sources d’Alice qu’elle voit, hors assistants, et écrit sa réponse', async () => {
    const [alice, bob] = await newPair();
    const { githubId, gmailId } = await seedPeople(alice, bob);
    const llm = createFakeLlm({
      texts: ['Responsable produit chez Acme. ', 'Ces dernières semaines : le budget.'],
    });

    expect(await proposeAbout(alice, { llm })).toBe(true);

    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call?.step).toBe('point');
    const prompt = call?.messages.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain(DATA_GUARD_LINE);
    expect(prompt).toContain('#22 Renouveler le jeton');
    expect(prompt).toContain('Point budget du trimestre');
    for (const hidden of [
      'cachée',
      'Texte réservé à Bob',
      'Session privée',
      'conversation avec',
      'LIN-4',
      'Texte de Bob',
    ]) {
      expect(prompt).not.toContain(hidden);
    }
    const [row] = await rowsOf(alice);
    expect(row).toMatchObject({
      tenantId: alice.tenantId,
      userId: alice.userId,
      text: 'Responsable produit chez Acme. Ces dernières semaines : le budget.',
      acl: [alice.userId],
      closedAt: null,
    });
    expect(row?.sourceIds.toSorted()).toEqual([githubId, gmailId].toSorted());
    expect(await rowsOf(bob)).toEqual([]);
  });

  it('range un texte de 900 caractères à 500 en reculant jusqu’au dernier mot entier', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);

    await proposeAbout(alice, { llm: createFakeLlm({ texts: ['alpha '.repeat(150)] }) });

    // 500 tombe au milieu du 84e « alpha » (une coupe sèche donnerait « …alpha al »).
    const stored = (await rowsOf(alice))[0]?.text ?? '';
    expect(stored.length).toBeLessThanOrEqual(500);
    expect(stored.endsWith('alpha')).toBe(true);
    expect(stored).toBe('alpha '.repeat(83).trim());
  });

  it('coupe net à 500 un texte de 900 caractères sans aucun blanc', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);

    await proposeAbout(alice, { llm: createFakeLlm({ texts: ['a'.repeat(900)] }) });

    expect((await rowsOf(alice))[0]?.text).toBe('a'.repeat(500));
  });

  it('retire les NUL de la réponse, que Postgres refuse dans un texte', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);

    await expect(
      proposeAbout(alice, { llm: createFakeLlm({ texts: ['\u0000Responsable\u0000 produit.'] }) }),
    ).resolves.toBe(true);

    expect((await rowsOf(alice))[0]?.text).toBe('Responsable produit.');
  });

  it('ne coupe pas un émoji en deux à la limite', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);

    await proposeAbout(alice, { llm: createFakeLlm({ texts: [`${'a'.repeat(499)}😀 la suite`] }) });

    expect((await rowsOf(alice))[0]?.text).toBe('a'.repeat(499));
  });

  it('ne garde aucun renvoi [n] du modèle', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);

    await proposeAbout(alice, {
      llm: createFakeLlm({ texts: ['Le budget [1] et la PR #22 [2][3].'] }),
    });

    expect((await rowsOf(alice))[0]?.text).toBe('Le budget et la PR #22.');
  });

  it('n’appelle pas le modèle et n’écrit rien pour une deuxième proposition', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);
    const llm = createFakeLlm({ texts: ['Première.'] });

    expect(await proposeAbout(alice, { llm })).toBe(true);
    expect(await proposeAbout(alice, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(1);
    expect((await rowsOf(alice)).map((row) => row.text)).toEqual(['Première.']);
  });

  it('n’écrit rien, sans appeler le modèle, quand la matière est vide', async () => {
    const [alice, bob] = await newPair();
    await seedRun(alice, { kind: 'claude_code', turns: [{ text: 'Assistant seulement.' }] });
    await seedRun(bob, { kind: 'github', acl: [bob.tenantId], turns: [{ text: 'À Bob.' }] });
    const llm = createFakeLlm({ texts: ['Jamais écrit.'] });

    expect(await proposeAbout(alice, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await rowsOf(alice)).toEqual([]);
  });

  it.each([[['']], [[' \n ']], [[]]])(
    'n’écrit rien et rend false pour une réponse vide (%j)',
    async (texts) => {
      const [alice, bob] = await newPair();
      await seedPeople(alice, bob);

      await expect(proposeAbout(alice, { llm: createFakeLlm({ texts }) })).resolves.toBe(false);

      expect(await rowsOf(alice)).toEqual([]);
    },
  );

  it('n’écrit rien quand « À propos » est déjà rempli', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);
    await setAbout(alice, 'Responsable produit.');
    const llm = createFakeLlm({ texts: ['Jamais écrit.'] });

    expect(await proposeAbout(alice, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await rowsOf(alice)).toEqual([]);
  });

  it('n’écrit rien pour un compte supprimé', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, alice.userId));
    const llm = createFakeLlm({ texts: ['Jamais écrit.'] });

    expect(await proposeAbout(alice, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await rowsOf(alice)).toEqual([]);
  });

  it('donne au modèle le poste et le nom de l’espace', async () => {
    const [alice, bob] = await newPair();
    await seedPeople(alice, bob);
    await adminDb
      .update(members)
      .set({ department: 'product', job: 'productManager', seniority: 5 })
      .where(eq(members.userId, alice.userId));
    const llm = createFakeLlm({ texts: ['Texte.'] });

    await proposeAbout(alice, { llm });

    const prompt = llm.calls[0]?.messages.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain(
      '<poste service="product" intitule="productManager" niveau="senior"/>',
    );
    expect(prompt).toContain('<espace nom="Organisation de test"/>');
  });
});

describe('gatherAboutMaterial', () => {
  it('lit les 2 derniers tours, ignore ce qui date de plus de 30 jours, et s’arrête à 40 sources', async () => {
    const [alice] = await newPair();
    const now = new Date();
    const old = await seedRun(alice, {
      kind: 'github',
      title: 'Trop ancienne',
      lastTurnAt: new Date(now.getTime() - 31 * DAY),
      turns: [{ text: 'Vieux.', ts: new Date(now.getTime() - 31 * DAY) }],
    });
    await seedRun(alice, {
      kind: 'github',
      title: 'Avec trois tours',
      lastTurnAt: new Date(now.getTime() - 5 * HOUR),
      turns: [
        { text: 'Premier tour.', ts: new Date(now.getTime() - 7 * HOUR) },
        { text: 'Deuxième tour.', ts: new Date(now.getTime() - 6 * HOUR) },
        { text: 'Troisième tour.', ts: new Date(now.getTime() - 5 * HOUR) },
      ],
    });

    const material = await gatherAboutMaterial(alice, now);

    expect(material.sources.map((entry) => entry.source.title)).toEqual(['Avec trois tours']);
    expect(material.sources[0]?.turns.map((turn) => turn.text)).toEqual([
      'Deuxième tour.',
      'Troisième tour.',
    ]);
    expect(material.sources.map((entry) => entry.source.sourceId)).not.toContain(old.sourceId);

    await adminDb.insert(sources).values(
      Array.from({ length: 45 }, (_, index) => ({
        tenantId: alice.tenantId,
        kind: 'notion' as const,
        externalId: randomUUID(),
        ownerUserId: alice.userId,
        title: `Page ${index}`,
        acl: [alice.userId],
        lastTurnAt: new Date(now.getTime() - (index + 1) * 60_000),
      })),
    );

    const capped = await gatherAboutMaterial(alice, now);

    expect(capped.sources).toHaveLength(40);
    expect(capped.sources[0]?.source.title).toBe('Page 0');
  });
});

// Une personne qui remplit toutes les conditions, sauf celles qu'on lui retire.
type Setup = {
  onboarded?: boolean;
  count?: number;
  kind?: SourceKind;
  connectionAge?: number;
  synced?: boolean;
  connectionBy?: 'self' | 'other';
  about?: string | null;
  suggestion?: boolean;
  deleted?: boolean;
};

async function person(setup: Setup = {}): Promise<TenantContext> {
  const [alice, bob] = await newPair();
  const {
    onboarded = true,
    count = ABOUT_MIN_SOURCES,
    kind = 'github',
    connectionAge = 2 * DAY,
    synced = true,
    connectionBy = 'self',
    about = null,
    suggestion = false,
    deleted = false,
  } = setup;
  if (onboarded) {
    await adminDb
      .update(members)
      .set({ onboardedAt: new Date() })
      .where(eq(members.userId, alice.userId));
  }
  await adminDb.insert(sources).values(
    Array.from({ length: count }, () => ({
      tenantId: alice.tenantId,
      kind,
      externalId: randomUUID(),
      ownerUserId: alice.userId,
      acl: [alice.userId],
    })),
  );
  const connectionId = await seedConnection(connectionBy === 'self' ? alice : bob);
  await adminDb
    .update(connections)
    .set({ createdAt: ago(connectionAge), lastSyncAt: synced ? ago(connectionAge / 2) : null })
    .where(eq(connections.id, connectionId));
  if (about !== null) await setAbout(alice, about);
  if (suggestion) {
    await adminPool.query(
      `insert into about_suggestions (tenant_id, user_id, text, acl) values ($1, $2, 'Déjà proposé.', array[$2::uuid])`,
      [alice.tenantId, alice.userId],
    );
  }
  if (deleted) {
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, alice.userId));
  }
  return alice;
}

async function isCandidate(ctx: TenantContext): Promise<boolean> {
  return (await listAboutCandidates()).some(
    (entry) => entry.tenantId === ctx.tenantId && entry.userId === ctx.userId,
  );
}

describe('listAboutCandidates', () => {
  it('rend la personne qui a 20 sources à elle et une connexion vieille de 2 jours, déjà relevée', async () => {
    expect(await isCandidate(await person())).toBe(true);
  });

  it.each<[string, Setup]>([
    ['19 sources seulement', { count: ABOUT_MIN_SOURCES - 1 }],
    ['des sources d’assistants, qui ne comptent pas', { kind: 'claude_code', count: 30 }],
    ['une connexion créée il y a une heure, même relevée', { connectionAge: HOUR }],
    ['une connexion jamais relevée', { synced: false }],
    ['une connexion d’un autre', { connectionBy: 'other' }],
    ['l’étape 1 pas validée', { onboarded: false }],
    ['« À propos » rempli', { about: 'Responsable produit.' }],
    ['une proposition déjà faite', { suggestion: true }],
    ['un compte supprimé', { deleted: true }],
  ])('ne rend pas la personne avec %s', async (_label, setup) => {
    expect(await isCandidate(await person(setup))).toBe(false);
  });

  it('rend la personne dont « À propos » ne contient que des blancs', async () => {
    expect(await isCandidate(await person({ about: ' \n ' }))).toBe(true);
  });

  // Alice est membre de deux espaces. La fonction contourne la sécurité par ligne : seul son SQL lie les sources et la
  // connexion au même espace. Ses 20 sources dans l'un et sa seule connexion dans l'autre ne la rendent candidate nulle part.
  it.each([
    ['ses sources dans le premier espace, sa connexion dans le second', false],
    ['ses sources dans le second espace, sa connexion dans le premier', true],
  ])('ne rend la personne dans aucun de ses deux espaces avec %s', async (_label, reversed) => {
    const [alice] = await newPair();
    const second = await newTeam(['Claire Petit'], tenantIds);
    await adminDb.insert(members).values({
      organizationId: second.tenantId,
      userId: alice.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await adminDb
      .update(members)
      .set({ onboardedAt: new Date() })
      .where(eq(members.userId, alice.userId));
    const spaces = [alice.tenantId, second.tenantId];
    const [withSources, withConnection] = reversed ? spaces.toReversed() : spaces;
    await adminDb.insert(sources).values(
      Array.from({ length: ABOUT_MIN_SOURCES }, () => ({
        tenantId: withSources as string,
        kind: 'github' as const,
        externalId: randomUUID(),
        ownerUserId: alice.userId,
        acl: [alice.userId],
      })),
    );
    const connectionId = await seedConnection({ ...alice, tenantId: withConnection as string });
    await adminDb
      .update(connections)
      .set({ createdAt: ago(2 * DAY), lastSyncAt: ago(DAY) })
      .where(eq(connections.id, connectionId));

    for (const tenantId of spaces) {
      expect(await isCandidate({ ...alice, tenantId })).toBe(false);
    }
  });
});

describe('about_suggestions : droits', () => {
  it('ne se lit que par la personne, et seule la fermeture se modifie', async () => {
    const [alice, bob] = await newPair();
    await adminPool.query(
      `insert into about_suggestions (tenant_id, user_id, text, acl) values ($1, $2, 'Texte.', array[$2::uuid])`,
      [alice.tenantId, alice.userId],
    );

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select().from(aboutSuggestions));

    expect(await read(bob)).toEqual([]);
    expect(await read(alice)).toHaveLength(1);
    await withTenant(alice, (tx) =>
      tx
        .update(aboutSuggestions)
        .set({ closedAt: new Date() })
        .where(eq(aboutSuggestions.userId, alice.userId)),
    );
    await expect(
      withTenant(alice, (tx) =>
        tx
          .update(aboutSuggestions)
          .set({ text: 'Changé.' })
          .where(eq(aboutSuggestions.userId, alice.userId)),
      ),
    ).rejects.toThrow();
    await expect(
      adminPool.query(
        `insert into about_suggestions (tenant_id, user_id, text, acl) values ($1, $2, 'Texte.', array[$3::uuid])`,
        [bob.tenantId, bob.userId, alice.userId],
      ),
    ).rejects.toThrow(/check/);
  });
});

// Une proposition posée comme le travail de fond l'écrit : ouverte, avec les sources fournies au modèle.
const suggest = (
  ctx: TenantContext,
  sourceIds: string[],
  text = 'Responsable produit chez Acme.',
) =>
  adminPool.query(
    `insert into about_suggestions (tenant_id, user_id, text, source_ids, acl) values ($1, $2, $3, $4::uuid[], array[$2::uuid])`,
    [ctx.tenantId, ctx.userId, text, sourceIds],
  );

describe('readAboutSuggestion et closeAboutSuggestion', () => {
  it('lit la proposition ouverte de la personne, avec les outils de ses sources du plus fréquent au moins fréquent', async () => {
    const [alice, bob] = await newPair();
    const { githubId, gmailId } = await seedPeople(alice, bob);
    const second = await seedRun(alice, { kind: 'github', title: '#23 Autre ticket' });
    await suggest(alice, [gmailId, githubId, second.sourceId]);

    expect(await readAboutSuggestion(alice)).toEqual({
      text: 'Responsable produit chez Acme.',
      kinds: ['github', 'gmail'],
    });
    expect(await readAboutSuggestion(bob)).toBeNull();
  });

  it('ne rend que 6 outils, à fréquence égale par ordre alphabétique', async () => {
    const [alice] = await newPair();
    const ids: string[] = [];
    for (const kind of [
      'github',
      'gmail',
      'notion',
      'linear',
      'asana',
      'sentry',
      'slack',
    ] as const) {
      ids.push((await seedRun(alice, { kind })).sourceId);
    }
    await suggest(alice, ids);

    expect((await readAboutSuggestion(alice))?.kinds).toEqual([
      'asana',
      'github',
      'gmail',
      'linear',
      'notion',
      'sentry',
    ]);
  });

  it('ne se lit plus une fois fermée, et la fermeture ne touche que la ligne de la personne', async () => {
    const [alice, bob] = await newPair();
    await suggest(alice, []);
    await suggest(bob, [], 'Pour Bob.');

    await closeAboutSuggestion(alice);

    expect(await readAboutSuggestion(alice)).toBeNull();
    expect(await readAboutSuggestion(bob)).toEqual({ text: 'Pour Bob.', kinds: [] });
    expect((await rowsOf(alice))[0]?.closedAt).toBeInstanceOf(Date);
    expect((await rowsOf(bob))[0]?.closedAt).toBeNull();
    await expect(closeAboutSuggestion(alice)).resolves.toBeUndefined();
  });

  it("ne lit « À propos » que s'il y a une proposition ouverte", async () => {
    const [alice, bob] = await newPair();
    vi.mocked(readAbout).mockClear();

    // Rien pour Alice, une proposition fermée pour Bob : aucune lecture.
    expect(await readAboutSuggestion(alice)).toBeNull();
    await suggest(bob, []);
    await closeAboutSuggestion(bob);
    expect(await readAboutSuggestion(bob)).toBeNull();
    expect(readAbout).not.toHaveBeenCalled();

    await suggest(alice, [], 'Autre.');
    expect(await readAboutSuggestion(alice)).toEqual({ text: 'Autre.', kinds: [] });
    expect(readAbout).toHaveBeenCalledTimes(1);
  });

  it('ne se lit plus quand « À propos » est rempli ailleurs, sauf de blancs', async () => {
    const [alice] = await newPair();
    await suggest(alice, []);

    await setAbout(alice, ' \n ');
    expect(await readAboutSuggestion(alice)).not.toBeNull();

    await setAbout(alice, 'Responsable produit.');
    expect(await readAboutSuggestion(alice)).toBeNull();
    // Elle reste ouverte : seul « Not now » ou « Save » la ferme.
    expect((await rowsOf(alice))[0]?.closedAt).toBeNull();
  });

  it('ne se lit plus quand une de ses sources devient invisible pour la personne', async () => {
    const [alice, bob] = await newPair();
    const { githubId, gmailId } = await seedPeople(alice, bob);
    await suggest(alice, [githubId, gmailId]);
    expect(await readAboutSuggestion(alice)).not.toBeNull();

    await adminDb
      .update(sources)
      .set({ acl: [bob.userId] })
      .where(eq(sources.id, gmailId));

    expect(await readAboutSuggestion(alice)).toBeNull();
  });
});
