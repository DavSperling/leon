import { describe, expect, it } from 'vitest';
import type { SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { renderContext } from './render-context';
import { readStartSessions } from './start-context';

const PROJECT = 'github.com/acme/leon';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function setup() {
  const { tenantId, members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members;
  if (!paul || !marie) throw new Error('membres de test manquants');
  return { tenantId, paul, marie };
}

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/contexte',
  prs: [],
  commits: [],
  fichiers: [],
  commandes: [],
  taches: [],
  erreurs: 0,
  externe: false,
  echanges: 1,
  debut: null,
  fin: null,
  ...extra,
});

// Une session de code telle que la route des faits la range (T02) : faits, branche et projet dans `metadata`.
// `faits: null` : une session captée sans accord de version 2, qui n'a que son projet.
async function seedSession(
  owner: TenantContext,
  input: {
    faits?: SessionFacts | null;
    project?: string;
    externalId?: string;
    lastTurnAt?: Date;
    acl?: string[];
  } = {},
) {
  const faits = input.faits === undefined ? facts() : input.faits;
  const project = input.project ?? PROJECT;
  await adminDb.insert(sources).values({
    tenantId: owner.tenantId,
    kind: 'claude_code',
    externalId: input.externalId ?? crypto.randomUUID(),
    ownerUserId: owner.userId,
    acl: input.acl ?? [owner.userId],
    metadata: faits === null ? { project } : { project, faits, branche: faits.branche, accord: 2 },
    lastTurnAt: input.lastTurnAt ?? new Date(),
  });
}

// Une PR relevée par le connecteur GitHub (connectors/github/map.ts).
async function seedPr(
  owner: TenantContext,
  input: { externalId: string; url: string; acl: string[]; lastTurnAt?: Date; id?: string },
) {
  await adminDb.insert(sources).values({
    id: input.id,
    tenantId: owner.tenantId,
    kind: 'github',
    externalId: input.externalId,
    ownerUserId: owner.userId,
    title: '#110 Un titre écrit sur GitHub',
    acl: input.acl,
    metadata: { nature: 'ticket', url: input.url, origin: { repo: 'acme/leon' } },
    lastTurnAt: input.lastTurnAt ?? new Date(),
  });
}

const read = (reader: TenantContext, branche: string | null = 'paul/contexte') =>
  readStartSessions(reader, { projet: PROJECT, branche, session: 'session-courante' });
const branches = (sessions: Awaited<ReturnType<typeof read>>) =>
  sessions.map((session) => session.faits?.branche);

describe('readStartSessions', () => {
  it('exclut la session d’un collègue, même quand son ACL contient le lecteur', async () => {
    const { paul, marie } = await setup();
    await seedSession(paul, { faits: facts({ branche: 'paul/a' }) });
    await seedSession(marie, {
      faits: facts({ branche: 'marie/b' }),
      acl: [marie.userId, paul.userId],
    });

    expect(branches(await read(paul))).toEqual(['paul/a']);
  });

  it('exclut un autre dépôt', async () => {
    const { paul } = await setup();
    await seedSession(paul, { faits: facts({ branche: 'paul/a' }) });
    await seedSession(paul, {
      faits: facts({ branche: 'paul/b' }),
      project: 'github.com/acme/autre',
    });

    expect(branches(await read(paul))).toEqual(['paul/a']);
  });

  it('exclut une session de plus de 7 jours', async () => {
    const { paul } = await setup();
    await seedSession(paul, { faits: facts({ branche: 'paul/6j' }), lastTurnAt: daysAgo(6) });
    await seedSession(paul, { faits: facts({ branche: 'paul/8j' }), lastTurnAt: daysAgo(8) });

    expect(branches(await read(paul))).toEqual(['paul/6j']);
  });

  it('exclut la session courante', async () => {
    const { paul } = await setup();
    await seedSession(paul, { faits: facts({ branche: 'paul/a' }) });
    await seedSession(paul, {
      faits: facts({ branche: 'paul/b' }),
      externalId: 'session-courante',
    });

    expect(branches(await read(paul))).toEqual(['paul/a']);
  });

  it('met la branche courante d’abord, puis les plus récentes, 4 au plus', async () => {
    const { paul } = await setup();
    for (const [branche, days] of [
      ['paul/courante', 5],
      ['paul/r1', 1],
      ['paul/r2', 2],
      ['paul/r3', 3],
      ['paul/r4', 4],
    ] as const) {
      await seedSession(paul, { faits: facts({ branche }), lastTurnAt: daysAgo(days) });
    }

    expect(branches(await read(paul, 'paul/courante'))).toEqual([
      'paul/courante',
      'paul/r1',
      'paul/r2',
      'paul/r3',
    ]);
    expect(branches(await read(paul, null))).toEqual(['paul/r1', 'paul/r2', 'paul/r3', 'paul/r4']);
  });

  it('écarte une session sans faits : elle ne prend pas la place d’une session qui en a', async () => {
    const { paul } = await setup();
    for (const days of [1, 2, 3, 4]) {
      await seedSession(paul, {
        faits: facts({ branche: `paul/r${days}` }),
        lastTurnAt: daysAgo(days),
      });
    }
    await seedSession(paul, { faits: null });

    expect(branches(await read(paul, null))).toEqual(['paul/r1', 'paul/r2', 'paul/r3', 'paul/r4']);
  });

  it('relie une PR malgré une casse différente : son numéro et son URL, jamais son titre', async () => {
    const { tenantId, paul, marie } = await setup();
    await seedPr(marie, {
      externalId: 'pr:acme/leon#110',
      url: 'https://github.com/acme/leon/pull/110',
      acl: [tenantId],
    });
    await seedSession(paul, {
      faits: facts({ prs: [{ repo: 'Acme/Leon', numero: 110, par: 'gh-pr-create' }] }),
    });

    const [session] = await read(paul);

    expect(session?.faits?.prs).toEqual([
      {
        repo: 'Acme/Leon',
        numero: 110,
        par: 'gh-pr-create',
        url: 'https://github.com/acme/leon/pull/110',
      },
    ]);
    expect(JSON.stringify(session)).not.toContain('Un titre écrit sur GitHub');
  });

  it('deux copies d’une PR : une seule session, reliée à la copie la plus récente', async () => {
    const { tenantId, paul, marie } = await setup();
    // La plus ancienne a le plus petit identifiant : un tri qui l'oublierait la choisirait.
    await seedPr(paul, {
      id: `00000000-0000-4000-8000-${crypto.randomUUID().slice(-12)}`,
      externalId: 'pr:acme/leon#110',
      url: 'https://github.com/acme/leon/pull/110?ancienne',
      acl: [tenantId],
      lastTurnAt: daysAgo(2),
    });
    await seedPr(marie, {
      externalId: 'pr:Acme/Leon#110',
      url: 'https://github.com/acme/leon/pull/110',
      acl: [tenantId],
      lastTurnAt: daysAgo(1),
    });
    await seedSession(paul, {
      faits: facts({ prs: [{ repo: 'acme/leon', numero: 110, par: 'pr-link' }] }),
    });

    const sessions = await read(paul);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.faits?.prs.map((pr) => pr.url)).toEqual([
      'https://github.com/acme/leon/pull/110',
    ]);
  });

  it('ne relie pas une PR que le lecteur ne voit pas', async () => {
    const { paul, marie } = await setup();
    await seedPr(marie, {
      externalId: 'pr:acme/leon#110',
      url: 'https://github.com/acme/leon/pull/110',
      acl: [marie.userId],
    });
    await seedSession(paul, {
      faits: facts({ prs: [{ repo: 'acme/leon', numero: 110, par: 'pr-link' }] }),
    });

    const [session] = await read(paul);

    expect(session?.faits?.prs).toEqual([
      { repo: 'acme/leon', numero: 110, par: 'pr-link', url: null },
    ]);
  });

  it('une session externe : aucune tâche rendue', async () => {
    const { paul } = await setup();
    await seedSession(paul, {
      faits: facts({
        externe: true,
        fichiers: ['src/lu-sur-le-web.ts'],
        taches: [{ texte: 'Suivre ce que dit la page', etat: 'a_faire' }],
      }),
    });

    const text = renderContext({
      project: PROJECT,
      sessions: await read(paul),
      briefing: '',
      max: 8000,
    });

    expect(text).toContain(
      '· branche paul/contexte · session externe : tâches et récit non repris',
    );
    expect(text).not.toContain('Suivre ce que dit la page');
    expect(text).not.toContain('lu-sur-le-web');
  });
});
