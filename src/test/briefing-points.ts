import { and, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { BRIEFING_QUEUES, briefingKey, getBriefingBoss } from '@/server/briefing/queue';
import { briefings } from '@/server/db/schema/search';
import { adminDb, adminPool } from './db';

// Un point du matin tout prêt, lu à l'instant, pour voir qu'un changement le marque périmé et le remet en file
// (comme le describe « saveAbout » de briefings.db.test.ts). Les travaux vont dans le vrai pg-boss de la base de
// test : `dropPoints` les retire et arrête le patron, à appeler dans `afterAll`.

export async function seedPoint(owner: TenantContext): Promise<string> {
  const project = `github.com/acme/depot-${crypto.randomUUID().slice(0, 8)}`;
  await adminDb.insert(briefings).values({
    tenantId: owner.tenantId,
    userId: owner.userId,
    project,
    markdown: '# Point',
    preparedAt: new Date(),
    lastReadAt: new Date(),
    acl: [owner.userId],
  });
  return project;
}

export async function pointIsStale(owner: TenantContext, project: string): Promise<boolean> {
  const [row] = await adminDb
    .select({ stale: briefings.stale })
    .from(briefings)
    .where(and(eq(briefings.userId, owner.userId), eq(briefings.project, project)));
  return row?.stale ?? false;
}

export async function queuedRefreshes(owner: TenantContext, project: string) {
  const boss = await getBriefingBoss();
  const key = briefingKey({ tenantId: owner.tenantId, userId: owner.userId, project });
  return boss.findJobs(BRIEFING_QUEUES.refresh, { key, queued: true });
}

export async function dropPoints(tenantIds: string[]): Promise<void> {
  const boss = await getBriefingBoss();
  const { rows } = await adminPool.query<{ tenant_id: string; user_id: string; project: string }>(
    'delete from briefings where tenant_id = any($1) returning tenant_id, user_id, project',
    [tenantIds],
  );
  for (const row of rows) {
    const key = briefingKey({ tenantId: row.tenant_id, userId: row.user_id, project: row.project });
    const left = await boss.findJobs(BRIEFING_QUEUES.refresh, { key });
    if (left.length > 0) {
      await boss.deleteJob(
        BRIEFING_QUEUES.refresh,
        left.map((job) => job.id),
      );
    }
  }
  await boss.stop();
}
