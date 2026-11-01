import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import { developerSpace, isDeveloper } from './space';

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const codeSession = (
  owner: TenantContext,
  title: string,
  input: { project: string; shared: boolean; lastTurnAt?: Date },
) =>
  seedRun(owner, {
    kind: 'claude_code',
    title,
    acl: input.shared ? [owner.tenantId] : [owner.userId],
    metadata: { project: input.project },
    lastTurnAt: input.lastTurnAt ?? new Date(),
  });

describe('isDeveloper', () => {
  it('vaut vrai pour un membre qui a une session Claude Code ou une note de passation, faux sinon', async () => {
    const { tenantId, members } = await newTeam(['Paul', 'Marie', 'Julie'], tenantIds);
    const [paul, marie, julie] = members as [TenantContext, TenantContext, TenantContext];
    await codeSession(paul, 'Cache', { project: 'github.com/acme/app', shared: false });
    await seedRun(marie, {
      kind: 'passation',
      acl: [tenantId],
      metadata: { project: 'github.com/acme/app' },
    });
    await seedRun(julie, { kind: 'chatgpt' });

    expect(await isDeveloper(paul)).toBe(true);
    expect(await isDeveloper(marie)).toBe(true);
    expect(await isDeveloper(julie)).toBe(false);
  });
});

describe('developerSpace', () => {
  it('range par dépôt les sessions partagées, les notes, et à part les sessions privées du lecteur', async () => {
    const { tenantId, members } = await newTeam(['Paul', 'Marie', 'Julie'], tenantIds);
    const [paul, marie, julie] = members as [TenantContext, TenantContext, TenantContext];
    const other = await newTeam(['Zoé'], tenantIds);
    const zoe = other.members[0] as TenantContext;

    const old = await codeSession(paul, 'Ancienne', {
      project: 'github.com/acme/app',
      shared: true,
      lastTurnAt: daysAgo(2),
    });
    const hers = await codeSession(marie, 'De Marie', {
      project: 'github.com/acme/app',
      shared: true,
    });
    const secret = await codeSession(paul, 'Privée', {
      project: 'github.com/acme/app',
      shared: false,
    });
    await codeSession(marie, 'Privée de Marie', { project: 'github.com/acme/app', shared: false });
    await codeSession(zoe, 'Ailleurs', { project: 'github.com/acme/app', shared: true });
    await seedRun(marie, {
      kind: 'passation',
      acl: [tenantId],
      metadata: { project: 'github.com/acme/notes' },
      turns: [{ text: "## Où j'en suis\nCache à revoir." }],
    });
    await withTenant(paul, (tx) =>
      tx.execute(sql`select regler_partage_depot('github.com/acme/cache', false)`),
    );

    const space = await developerSpace(paul);

    expect(space?.repos.map((repo) => repo.project)).toEqual([
      'github.com/acme/app',
      'github.com/acme/cache',
      'github.com/acme/notes',
    ]);
    const [app, cache, notes] = space?.repos ?? [];
    expect(app?.sessions.map((session) => session.id)).toEqual([hers.sourceId, old.sourceId]);
    expect(app?.mineShared).toBe(true);
    expect(cache?.mineShared).toBe(false);
    expect(notes?.notes).toContain('Cache à revoir.');
    expect(space?.privateSessions.map((session) => session.id)).toEqual([secret.sourceId]);
    expect(await developerSpace(julie)).toBeNull();
  });
});
