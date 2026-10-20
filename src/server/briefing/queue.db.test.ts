import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefings } from '@/server/db/schema/search';
import { getBoss } from '@/server/pipeline/queue';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, createTestUser } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import {
  BRIEFING_DELAY_SECONDS,
  BRIEFING_QUEUES,
  briefingKey,
  enqueueBriefingRefresh,
  projectOfSource,
  signalProjectActivity,
  signalSourceActivity,
} from './queue';

// La mise en file des recalculs, sur le vrai pg-boss de la base de test : la règle « un seul job en attente par
// (organisation, utilisateur, projet) » est celle de la file (politique `stately`), pas du code. Aucun worker ne lit
// la file ici : les jobs restent en attente, et ce fichier retire les siens à la fin.

const tenantIds: string[] = [];
const keys = new Set<string>();
let tenantId: string;
let alice: TenantContext;
let bob: TenantContext;
let carol: TenantContext;
let zoe: TenantContext;

const uniqueProject = () => `github.com/acme/projet-${crypto.randomUUID().slice(0, 8)}`;

async function seedBriefing(owner: TenantContext, project: string): Promise<void> {
  await adminDb.insert(briefings).values({
    tenantId: owner.tenantId,
    userId: owner.userId,
    project,
    markdown: '# Point du matin',
    preparedAt: new Date(),
    acl: [owner.userId],
  });
}

async function jobsFor(owner: TenantContext, project: string) {
  const key = briefingKey({ tenantId: owner.tenantId, userId: owner.userId, project });
  keys.add(key);
  const boss = await getBoss();
  return boss.findJobs(BRIEFING_QUEUES.refresh, { key, queued: true });
}

async function staleOf(owner: TenantContext, project: string): Promise<boolean | undefined> {
  const [row] = await adminDb
    .select({ stale: briefings.stale })
    .from(briefings)
    .where(and(eq(briefings.project, project), eq(briefings.userId, owner.userId)));
  return row?.stale;
}

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob', 'Carol']);
  const other = await createTestTenant(['Zoé']);
  tenantId = team.tenantId;
  [alice, bob, carol] = team.members as [TenantContext, TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

afterAll(async () => {
  const boss = await getBoss();
  for (const key of keys) {
    const left = await boss.findJobs(BRIEFING_QUEUES.refresh, { key });
    if (left.length > 0) {
      await boss.deleteJob(
        BRIEFING_QUEUES.refresh,
        left.map((job) => job.id),
      );
    }
  }
  await adminPool.query('delete from briefings where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await boss.stop();
});

describe('signalProjectActivity', () => {
  it('marque périmé et met en file le point de chaque membre qui en a un sur ce projet, dans 30 minutes', async () => {
    const project = uniqueProject();
    const other = uniqueProject();
    await seedBriefing(alice, project);
    await seedBriefing(bob, project);
    await seedBriefing(alice, other);
    const before = Date.now();

    await signalProjectActivity(alice, project, []);

    for (const member of [alice, bob]) {
      const jobs = await jobsFor(member, project);
      expect(jobs, 'un job par membre').toHaveLength(1);
      expect(jobs[0]?.data).toEqual({ tenantId, userId: member.userId, project });
      const delay = (jobs[0]?.startAfter.getTime() ?? 0) - before;
      expect(delay).toBeGreaterThan((BRIEFING_DELAY_SECONDS - 60) * 1000);
      expect(delay).toBeLessThan((BRIEFING_DELAY_SECONDS + 60) * 1000);
      expect(await staleOf(member, project)).toBe(true);
    }
    expect(BRIEFING_DELAY_SECONDS).toBe(30 * 60);
    expect(await staleOf(alice, other)).toBe(false);
    expect(await jobsFor(alice, other)).toEqual([]);
  });

  it('deux signaux en 30 minutes ne donnent qu’un seul job par membre', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, project);

    await signalProjectActivity(alice, project, []);
    await signalProjectActivity(alice, project, []);

    expect(await jobsFor(alice, project)).toHaveLength(1);
  });

  it('ne touche jamais un membre d’une autre organisation, même s’il a un point sur ce projet', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, project);
    await seedBriefing(zoe, project);

    await signalProjectActivity(alice, project, [zoe.userId]);

    expect(await jobsFor(zoe, project)).toEqual([]);
    expect(await staleOf(zoe, project)).toBe(false);
    expect(await jobsFor(alice, project)).toHaveLength(1);
  });

  it('met aussi en file les utilisateurs nommés en plus, même sans point sur ce projet', async () => {
    const project = uniqueProject();

    await signalProjectActivity(alice, project, [carol.userId]);

    expect(await jobsFor(carol, project)).toHaveLength(1);
    expect(await jobsFor(alice, project)).toEqual([]);
  });

  it('saute sans erreur un membre parti de l’organisation', async () => {
    const project = uniqueProject();
    const team = await createTestTenant(['Dora']);
    tenantIds.push(team.tenantId);
    const [dora] = team.members as [TenantContext];
    const gone = await createTestUser(team.tenantId, 'Élie');
    await seedBriefing(dora, project);
    await seedBriefing(gone, project);
    await adminPool.query('delete from member where "userId" = $1', [gone.userId]);

    await expect(signalProjectActivity(dora, project, [])).resolves.toBeUndefined();

    expect(await jobsFor(gone, project)).toEqual([]);
    expect(await jobsFor(dora, project)).toHaveLength(1);
  });

  it('ignore une clé de projet invalide', async () => {
    await expect(signalProjectActivity(alice, 'evil', [alice.userId])).resolves.toBeUndefined();
    expect(await jobsFor(alice, 'evil')).toEqual([]);
  });
});

describe('enqueueBriefingRefresh', () => {
  it('met en file tout de suite, et ne double pas un job déjà en attente', async () => {
    const project = uniqueProject();
    const job = { tenantId, userId: bob.userId, project };

    expect(await enqueueBriefingRefresh(job)).toBe(true);
    expect(await enqueueBriefingRefresh(job)).toBe(false);

    const jobs = await jobsFor(bob, project);
    expect(jobs).toHaveLength(1);
    expect((jobs[0]?.startAfter.getTime() ?? Infinity) - Date.now()).toBeLessThan(5000);
  });
});

describe('projectOfSource', () => {
  const owner = crypto.randomUUID();

  it('une session Claude Code : son projet, et son propriétaire en plus des membres qui ont un point', () => {
    expect(
      projectOfSource({
        kind: 'claude_code',
        ownerUserId: owner,
        metadata: { project: 'dossier:0123456789abcdef' },
      }),
    ).toEqual({ project: 'dossier:0123456789abcdef', extraUserIds: [owner] });
  });

  it('un élément GitHub : la clé de son dépôt, en minuscules', () => {
    expect(
      projectOfSource({
        kind: 'github',
        ownerUserId: owner,
        metadata: { origin: { repo: 'Acme/Leon' } },
      }),
    ).toEqual({ project: 'github.com/acme/leon', extraUserIds: [] });
  });

  it('rien pour une autre source ou une clé invalide', () => {
    expect(
      projectOfSource({
        kind: 'linear',
        ownerUserId: owner,
        metadata: { project: 'github.com/a/b' },
      }),
    ).toBeNull();
    expect(projectOfSource({ kind: 'claude_code', ownerUserId: owner, metadata: {} })).toBeNull();
    expect(
      projectOfSource({ kind: 'claude_code', ownerUserId: owner, metadata: { project: 'evil' } }),
    ).toBeNull();
    expect(
      projectOfSource({
        kind: 'github',
        ownerUserId: owner,
        metadata: { origin: { repo: '../x' } },
      }),
    ).toBeNull();
    expect(
      projectOfSource({ kind: 'github', ownerUserId: owner, metadata: { origin: 'acme/leon' } }),
    ).toBeNull();
  });
});

describe('signalSourceActivity', () => {
  it('signale le projet d’une session Claude Code à son propriétaire', async () => {
    const project = uniqueProject();
    const { sourceId } = await seedRun(carol, { kind: 'claude_code', metadata: { project } });

    await signalSourceActivity(carol, sourceId);

    expect(await jobsFor(carol, project)).toHaveLength(1);
  });

  it('signale le dépôt d’un élément GitHub aux membres qui ont un point dessus', async () => {
    const repo = `acme/depot-${crypto.randomUUID().slice(0, 8)}`;
    const project = `github.com/${repo}`;
    await seedBriefing(bob, project);
    const { sourceId } = await seedRun(alice, {
      kind: 'github',
      acl: [tenantId],
      metadata: { nature: 'ticket', origin: { repo } },
    });

    await signalSourceActivity(alice, sourceId);

    expect(await jobsFor(bob, project)).toHaveLength(1);
    expect(await jobsFor(alice, project)).toEqual([]);
  });

  it('ne fait rien pour une source invisible du lecteur', async () => {
    const project = uniqueProject();
    const { sourceId } = await seedRun(bob, { kind: 'claude_code', metadata: { project } });

    await signalSourceActivity(alice, sourceId);

    expect(await jobsFor(bob, project)).toEqual([]);
  });
});
