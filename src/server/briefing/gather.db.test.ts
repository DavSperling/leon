import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { turns as turnsTable } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import {
  BRIEFING_DAYS,
  BRIEFING_SESSIONS,
  gatherBriefingMaterial,
  MENTIONS_MAX,
  SESSION_TURNS_MAX,
  TURN_CHARS,
} from './gather';

// La matière du point du matin, rassemblée sous les droits du lecteur : ses sessions sur le projet, ce qui a bougé
// dans le dépôt depuis sa dernière session, et ce qui le mentionne. Les fixtures passent par le propriétaire de la
// base ; la lecture, elle, se fait sous withTenant du lecteur.

const PROJECT = 'github.com/acme/leon';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

const tenantIds: string[] = [];
let tenantId: string;
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;
let aliceEmail: string;
// Le début de la dernière session d'Alice sur le projet.
let lastSessionStart: Date;

async function session(
  owner: TenantContext,
  input: {
    title: string;
    project?: string;
    startedAgo: number;
    texts?: string[];
    kind?: 'claude_code' | 'codex';
  },
) {
  const start = ago(input.startedAgo);
  const texts = input.texts ?? [`Début de ${input.title}`, `Fin de ${input.title}`];
  const turns = texts.map((text, index) => ({
    text,
    role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    ts: new Date(start.getTime() + index * 60_000),
  }));
  return seedRun(owner, {
    kind: input.kind ?? 'claude_code',
    title: input.title,
    metadata: { project: input.project ?? PROJECT },
    turns,
    lastTurnAt: turns.at(-1)?.ts,
    status: 'done',
  });
}

async function githubItem(input: {
  title: string;
  repo: string;
  changedAgo: number;
  text: string;
}) {
  const ts = ago(input.changedAgo);
  return seedRun(alice, {
    kind: 'github',
    acl: [tenantId],
    title: input.title,
    metadata: {
      nature: 'ticket',
      url: `https://github.com/${input.repo}/pull/22`,
      origin: { repo: input.repo },
    },
    turns: [
      { text: `Description de ${input.title}`, ts: new Date(ts.getTime() - DAY), role: 'document' },
      { text: input.text, ts, role: 'participant', authorName: 'bob' },
    ],
    lastTurnAt: ts,
    status: 'done',
  });
}

beforeAll(async () => {
  const team = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  tenantId = team.tenantId;
  [alice, bob] = team.members as [TenantContext, TenantContext];
  const other = await newTeam(['Zoé Bernard'], tenantIds);
  [zoe] = other.members as [TenantContext];
  aliceEmail = await emailOf(alice);

  // Les sessions d'Alice : quatre récentes sur le projet (seules les trois dernières comptent), une trop ancienne,
  // une sur un autre projet.
  await session(alice, { title: 'Session 6 jours', startedAgo: 6 * DAY });
  await session(alice, { title: 'Session 5 jours', startedAgo: 5 * DAY });
  await session(alice, { title: 'Session 3 jours', startedAgo: 3 * DAY });
  await session(alice, {
    title: 'Session de la veille',
    startedAgo: DAY + 2 * HOUR,
    texts: [
      'Corrige le jeton de rafraîchissement.',
      'Fait : le jeton est renouvelé avant expiration.',
    ],
  });
  lastSessionStart = ago(DAY + 2 * HOUR);
  await session(alice, { title: 'Session ancienne', startedAgo: (BRIEFING_DAYS + 3) * DAY });
  await session(alice, {
    title: 'Session autre projet',
    project: 'github.com/acme/autre',
    startedAgo: HOUR,
  });
  // La conversation privée de Bob sur le même dépôt.
  await session(bob, {
    title: 'Session privée de Bob',
    startedAgo: 2 * HOUR,
    texts: ['Bob seul : le salaire de Julie est confidentiel.', 'Noté.'],
  });

  await githubItem({
    title: '#22 Renouveler le jeton',
    repo: 'Acme/Leon',
    changedAgo: 3 * HOUR,
    text: 'Approuvé, je fusionne.',
  });
  await githubItem({
    title: '#18 Ancien ticket',
    repo: 'acme/leon',
    changedAgo: 4 * DAY,
    text: 'Fermé il y a longtemps.',
  });
  await githubItem({
    title: '#5 Autre dépôt',
    repo: 'acme/autre',
    changedAgo: 2 * HOUR,
    text: 'Rien à voir.',
  });

  // Ce qui mentionne Alice : un ticket Linear de l'équipe ; puis ce qui ne doit pas compter.
  await seedIndexed(
    bob,
    {
      kind: 'linear',
      acl: [tenantId],
      title: 'LIN-4 Démo client',
      metadata: { nature: 'ticket' },
      turns: [
        {
          text: `${aliceEmail.toUpperCase()} prépare la démo de jeudi.`,
          ts: ago(5 * HOUR),
          authorName: 'Julie',
          authorEmail: 'julie@acme.test',
        },
        {
          text: `Avant la session : ${aliceEmail} était en congé.`,
          ts: ago(3 * DAY),
          authorName: 'Julie',
          authorEmail: 'julie@acme.test',
        },
        {
          text: `Je signe ${aliceEmail} en bas de mon propre message.`,
          ts: ago(4 * HOUR),
          authorName: 'Alice',
          authorEmail: aliceEmail,
        },
      ],
    },
    null,
  );
  await seedIndexed(
    bob,
    {
      kind: 'claude_ai',
      title: 'Conversation privée de Bob',
      turns: [{ text: `Bob se demande si ${aliceEmail} est au courant.`, ts: ago(HOUR) }],
    },
    null,
  );
  await seedIndexed(
    alice,
    {
      kind: 'claude_code',
      title: 'Session sans projet',
      turns: [{ text: `Mon adresse est ${aliceEmail}.`, ts: ago(HOUR) }],
    },
    null,
  );
});

afterAll(() => dropTeams(tenantIds));

describe('gatherBriefingMaterial', () => {
  it('rend les trois dernières sessions de l’utilisateur sur ce projet, de 14 jours au plus, la plus récente d’abord', async () => {
    const material = await gatherBriefingMaterial(alice, PROJECT, new Date());

    expect(BRIEFING_SESSIONS).toBe(3);
    expect(material.project).toBe(PROJECT);
    expect(material.sessions.map((entry) => entry.source.title)).toEqual([
      'Session de la veille',
      'Session 3 jours',
      'Session 5 jours',
    ]);
    const [latest] = material.sessions;
    expect(latest?.source.kind).toBe('claude_code');
    expect(latest?.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ['user', 'Corrige le jeton de rafraîchissement.'],
      ['assistant', 'Fait : le jeton est renouvelé avant expiration.'],
    ]);
  });

  it('compte ce qui a bougé depuis le début de la dernière session', async () => {
    const material = await gatherBriefingMaterial(alice, PROJECT, new Date());

    expect(Math.abs(material.since.getTime() - lastSessionStart.getTime())).toBeLessThan(5000);
  });

  it('rend les sources GitHub du dépôt qui ont bougé depuis, quelle que soit la casse du dépôt', async () => {
    const material = await gatherBriefingMaterial(alice, PROJECT, new Date());

    expect(material.changes.map((entry) => entry.source.title)).toEqual([
      '#22 Renouveler le jeton',
    ]);
    const [change] = material.changes;
    expect(change?.source.url).toBe('https://github.com/Acme/Leon/pull/22');
    expect(change?.turns.at(-1)).toMatchObject({
      role: 'participant',
      authorName: 'bob',
      text: 'Approuvé, je fusionne.',
    });
  });

  it('rend les passages qui mentionnent l’utilisateur depuis sa dernière session, sans ce qu’il a écrit lui-même', async () => {
    const material = await gatherBriefingMaterial(alice, PROJECT, new Date());

    expect(material.mentions.map((entry) => entry.excerpt.text)).toEqual([
      `${aliceEmail.toUpperCase()} prépare la démo de jeudi.`,
    ]);
    expect(material.mentions[0]?.source.title).toBe('LIN-4 Démo client');
    expect(material.mentions[0]?.excerpt.authorName).toBe('Julie');
    expect(material.mentions[0]?.passageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ne contient que ce que le lecteur voit : jamais la conversation privée d’un autre sur le même dépôt', async () => {
    const material = await gatherBriefingMaterial(alice, PROJECT, new Date());
    const text = JSON.stringify(material);

    expect(text).not.toContain('Session privée de Bob');
    expect(text).not.toContain('salaire de Julie');
    expect(text).not.toContain('Conversation privée de Bob');
    // Bob, lui, retrouve sa session : la lecture n'a pas simplement échoué.
    const asBob = await gatherBriefingMaterial(bob, PROJECT, new Date());
    expect(asBob.sessions.map((entry) => entry.source.title)).toEqual(['Session privée de Bob']);
    expect(JSON.stringify(asBob)).not.toContain('Corrige le jeton');
  });

  it('ne rend rien d’une autre organisation', async () => {
    const material = await gatherBriefingMaterial(zoe, PROJECT, new Date());

    expect(material.sessions).toEqual([]);
    expect(material.changes).toEqual([]);
    expect(material.mentions).toEqual([]);
  });

  // T18 : « mes sessions », tous outils de code confondus.
  it('rend aussi les sessions Codex de l’utilisateur sur le projet, avec celles de Claude Code', async () => {
    const project = 'github.com/acme/leon-codex';
    await session(alice, { title: 'Session Claude Code', project, startedAgo: 2 * HOUR });
    await session(alice, { title: 'Session Codex', project, startedAgo: HOUR, kind: 'codex' });

    const material = await gatherBriefingMaterial(alice, project, new Date());

    expect(material.sessions.map((entry) => [entry.source.kind, entry.source.title])).toEqual([
      ['codex', 'Session Codex'],
      ['claude_code', 'Session Claude Code'],
    ]);
  });

  it('sans session sur le projet, compte depuis 14 jours ; un projet de dossier n’a pas de dépôt', async () => {
    const now = new Date();
    const material = await gatherBriefingMaterial(alice, 'dossier:0123456789abcdef', now);

    expect(material.sessions).toEqual([]);
    expect(material.changes).toEqual([]);
    expect(now.getTime() - material.since.getTime()).toBe(BRIEFING_DAYS * DAY);
    // Les mentions, elles, ne dépendent pas du projet.
    expect(material.mentions.map((entry) => entry.source.title)).toContain('LIN-4 Démo client');
  });
});

describe('gatherBriefingMaterial : bornes', () => {
  const local: string[] = [];
  afterAll(() => dropTeams(local));

  it('coupe les tours longs et ne garde que les derniers tours d’une session', async () => {
    const team = await newTeam(['Camille'], local);
    const [camille] = team.members as [TenantContext];
    const long = `${'mot '.repeat(TURN_CHARS)}fin`;
    const texts = Array.from({ length: SESSION_TURNS_MAX + 5 }, (_, index) =>
      index === SESSION_TURNS_MAX + 4 ? long : `Tour ${index}`,
    );
    await session(camille, { title: 'Longue session', startedAgo: 2 * HOUR, texts });

    const material = await gatherBriefingMaterial(camille, PROJECT, new Date());

    const turns = material.sessions[0]?.turns ?? [];
    expect(turns).toHaveLength(SESSION_TURNS_MAX);
    expect(turns[0]?.text).toBe('Tour 5');
    const last = turns.at(-1)?.text ?? '';
    expect(last.length).toBeLessThanOrEqual(TURN_CHARS + 1);
    expect(last.endsWith('…')).toBe(true);
  });

  it('ne donne pas au point du matin le résumé d’une session écrit par Leon (T23)', async () => {
    const team = await newTeam(['Gaby'], local);
    const [gaby] = team.members as [TenantContext];
    const seeded = await session(gaby, { title: 'Session résumée', startedAgo: 2 * HOUR });
    await adminDb.insert(turnsTable).values({
      tenantId: gaby.tenantId,
      sourceId: seeded.sourceId,
      externalId: 'leon:resume:1',
      role: 'document',
      text: '## Où j’en suis\nRésumé de Leon',
      ts: ago(HOUR),
      captureMode: 'manual',
      acl: [gaby.userId],
    });

    const material = await gatherBriefingMaterial(gaby, PROJECT, new Date());

    expect(material.sessions[0]?.turns.map((turn) => turn.text)).toEqual([
      'Début de Session résumée',
      'Fin de Session résumée',
    ]);
  });

  it(`rend ${MENTIONS_MAX} mentions au plus, les plus récentes d’abord`, async () => {
    const team = await newTeam(['Dominique', 'Eva'], local);
    const [dominique, eva] = team.members as [TenantContext, TenantContext];
    const email = await emailOf(dominique);
    await seedIndexed(
      eva,
      {
        kind: 'notion',
        acl: [team.tenantId],
        title: 'Page très bavarde',
        metadata: { nature: 'page' },
        turns: Array.from({ length: MENTIONS_MAX + 2 }, (_, index) => ({
          text: `Note ${index} pour ${email}.`,
          ts: ago((index + 1) * HOUR),
        })),
      },
      null,
    );

    const material = await gatherBriefingMaterial(dominique, PROJECT, new Date());

    expect(material.mentions).toHaveLength(MENTIONS_MAX);
    expect(material.mentions[0]?.excerpt.text).toBe(`Note 0 pour ${email}.`);
    expect(material.mentions.at(-1)?.excerpt.text).toBe(`Note ${MENTIONS_MAX - 1} pour ${email}.`);
  });

  it('ne prend pour une mention que l’adresse entière, pas une adresse qui la contient', async () => {
    const team = await newTeam(['Fanny', 'Gil'], local);
    const [fanny, gil] = team.members as [TenantContext, TenantContext];
    const email = await emailOf(fanny);
    await seedIndexed(
      gil,
      {
        kind: 'notion',
        acl: [team.tenantId],
        title: 'Adresses voisines',
        metadata: { nature: 'page' },
        turns: [
          { text: `Écrire à jacques.${email} demain.`, ts: ago(2 * HOUR) },
          { text: `Voir avec ${email}, merci.`, ts: ago(HOUR) },
        ],
      },
      null,
    );

    const material = await gatherBriefingMaterial(fanny, PROJECT, new Date());

    expect(material.mentions.map((entry) => entry.excerpt.text)).toEqual([
      `Voir avec ${email}, merci.`,
    ]);
  });
});
