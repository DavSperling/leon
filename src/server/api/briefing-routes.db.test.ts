import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_PATHS, BRIEFING_PROJECT_PARAM, BriefingResponseSchema } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { BRIEFING_PENDING_MARKDOWN } from '@/server/briefing/briefings';
import { BRIEFING_QUEUES, briefingKey } from '@/server/briefing/queue';
import { briefings } from '@/server/db/schema/search';
import { getBoss } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { adminDb, adminPool } from '@/test/db';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';

// La route du point du matin (C8), lue par le crochet de démarrage de Claude Code : jeton personnel, projet en
// paramètre, le dernier point prêt (même périmé) ou le message d'attente, toujours vite. Le vrai pg-boss de la base
// de test reçoit les recalculs mis en file ; aucun worker ne les lit, et ce fichier retire les siens à la fin.

const tenantIds: string[] = [];
const keys = new Set<string>();
let alice: TenantContext;
let bob: TenantContext;
let aliceToken: string;
let bobToken: string;

const uniqueProject = () => `github.com/acme/projet-${crypto.randomUUID().slice(0, 8)}`;
const briefingUrl = (project: string) =>
  `${API_PATHS.briefing}?${new URLSearchParams({ [BRIEFING_PROJECT_PARAM]: project })}`;

async function seedBriefing(
  owner: TenantContext,
  project: string,
  input: { stale?: boolean; sourceIds?: string[]; preparedAt?: Date } = {},
) {
  await adminDb.insert(briefings).values({
    tenantId: owner.tenantId,
    userId: owner.userId,
    project,
    markdown: `# Point du matin · ${project}\n- Le jeton est corrigé [1].`,
    sourceIds: input.sourceIds ?? [],
    preparedAt: input.preparedAt ?? new Date('2026-10-20T04:00:00.000Z'),
    stale: input.stale ?? false,
    acl: [owner.userId],
  });
}

async function jobsFor(owner: TenantContext, project: string) {
  const key = briefingKey({ tenantId: owner.tenantId, userId: owner.userId, project });
  keys.add(key);
  return (await getBoss()).findJobs(BRIEFING_QUEUES.refresh, { key, queued: true });
}

beforeAll(async () => {
  const team = await newTeam(['Alice', 'Bob'], tenantIds);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  aliceToken = (await createApiToken(alice, 'crochet')).token;
  bobToken = (await createApiToken(bob, 'crochet')).token;
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
  await dropTeams(tenantIds);
  await boss.stop();
});

describe('GET /api/v1/briefing', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(briefingUrl(uniqueProject()));

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it.each([
    ['sans projet', API_PATHS.briefing],
    ['avec un projet invalide', briefingUrl('evil')],
    ['avec une adresse de remote', briefingUrl('https://jeton@github.com/acme/leon.git')],
  ])('répond 400 %s, sans recopier la valeur reçue', async (_name, path) => {
    const response = await apiRequest(path, { token: aliceToken });

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('evil');
    expect(text).not.toContain('jeton@');
  });

  it('sans point : le message d’attente, et le point mis en file', async () => {
    const project = uniqueProject();

    const response = await apiRequest(briefingUrl(project), { token: aliceToken });

    expect(response.status).toBe(200);
    expect(BriefingResponseSchema.parse(await response.json())).toEqual({
      markdown: BRIEFING_PENDING_MARKDOWN,
      projet: null,
      preparedAt: null,
    });
    expect(await jobsFor(alice, project)).toHaveLength(1);
  });

  it('avec un point, même périmé : le dernier, en moins de 3 secondes, et la lecture notée', async () => {
    const project = uniqueProject();
    const preparedAt = new Date('2026-10-20T04:00:00.000Z');
    await seedBriefing(alice, project, { stale: true, preparedAt });
    const started = Date.now();

    const response = await apiRequest(briefingUrl(project), { token: aliceToken });

    expect(Date.now() - started).toBeLessThan(3000);
    expect(response.status).toBe(200);
    expect(BriefingResponseSchema.parse(await response.json())).toEqual({
      markdown: `# Point du matin · ${project}\n- Le jeton est corrigé [1].`,
      projet: project,
      preparedAt: preparedAt.toISOString(),
    });
    const [row] = await adminDb
      .select({ lastReadAt: briefings.lastReadAt })
      .from(briefings)
      .where(and(eq(briefings.userId, alice.userId), eq(briefings.project, project)));
    expect(row?.lastReadAt).not.toBeNull();
  });

  it('ne rend jamais le point d’un autre', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, project);

    const response = await apiRequest(briefingUrl(project), { token: bobToken });

    expect((await response.json()).markdown).toBe(BRIEFING_PENDING_MARKDOWN);
  });

  // Vigilance 3 : le point déjà préparé ne montre plus une source que l'utilisateur ne voit plus.
  it('un point qui a reçu une source devenue invisible : le message d’attente, et le point remis en file', async () => {
    const project = uniqueProject();
    const { sourceId } = await seedRun(bob, { kind: 'claude_code', status: 'done' });
    await seedBriefing(alice, project, { sourceIds: [sourceId] });

    const response = await apiRequest(briefingUrl(project), { token: aliceToken });

    expect((await response.json()).markdown).toBe(BRIEFING_PENDING_MARKDOWN);
    expect(await jobsFor(alice, project)).toHaveLength(1);
  });
});
