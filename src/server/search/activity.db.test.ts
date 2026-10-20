import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { listActivity } from './activity';

// Les sources que le lecteur voit et qui passent les filtres, les plus récentes d'abord.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const NOW = new Date('2026-10-19T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

async function seedActivity() {
  const { tenantId, members } = await newTeam(['Alice', 'Bob'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  const aliceEmail = await emailOf(alice);
  const seed = (
    owner: TenantContext,
    title: string,
    kind: 'github' | 'notion' | 'claude_code',
    age: number,
    nature: string,
    authorEmail?: string,
  ) =>
    seedIndexed(owner, {
      kind,
      acl: kind === 'claude_code' ? [owner.userId] : [tenantId],
      title,
      metadata: { nature },
      turns: [{ text: `activité de ${title}`, ts: daysAgo(age), authorEmail }],
      lastTurnAt: daysAgo(age),
    });
  await seed(alice, 'PR 10', 'github', 8, 'ticket', aliceEmail);
  await seed(alice, 'PR 11', 'github', 1, 'ticket', 'bob@acme.fr');
  await seed(bob, 'Page cadrage', 'notion', 3, 'page', 'bob@acme.fr');
  await seed(alice, 'Ma conversation privée', 'claude_code', 2, 'conversation');
  return { alice, bob, aliceEmail };
}

const titles = (hits: Array<{ title: string | null }>) => hits.map((hit) => hit.title);

describe('listActivity', () => {
  it('rend les sources visibles, les plus récentes d’abord, avec leur passage le plus récent', async () => {
    const { alice, bob } = await seedActivity();
    const forAlice = await listActivity(alice, { filters: {}, limit: 10 });
    expect(titles(forAlice)).toEqual(['PR 11', 'Ma conversation privée', 'Page cadrage', 'PR 10']);
    expect(forAlice[0]).toMatchObject({ kind: 'github', nature: 'ticket', score: 0 });
    expect(forAlice[0]?.passages).toHaveLength(1);
    expect(forAlice[0]?.passages[0]?.snippet).toBe('activité de PR 11');
    // Bob ne voit pas la conversation privée d'Alice.
    expect(titles(await listActivity(bob, { filters: {}, limit: 10 }))).toEqual([
      'PR 11',
      'Page cadrage',
      'PR 10',
    ]);
  });

  it('respecte la limite', async () => {
    const { alice } = await seedActivity();
    expect(titles(await listActivity(alice, { filters: {}, limit: 2 }))).toEqual([
      'PR 11',
      'Ma conversation privée',
    ]);
    expect(await listActivity(alice, { filters: {}, limit: 0 })).toEqual([]);
  });

  it('applique les filtres : outil, type, dates, auteur', async () => {
    const { alice, aliceEmail } = await seedActivity();
    const list = async (filters: Parameters<typeof listActivity>[1]['filters']) =>
      titles(await listActivity(alice, { filters, limit: 10 }));
    expect(await list({ tools: ['github'] })).toEqual(['PR 11', 'PR 10']);
    expect(await list({ natures: ['page'] })).toEqual(['Page cadrage']);
    expect(await list({ since: daysAgo(3) })).toEqual([
      'PR 11',
      'Ma conversation privée',
      'Page cadrage',
    ]);
    expect(await list({ until: daysAgo(3) })).toEqual(['PR 10']);
    expect(await list({ authorEmails: [aliceEmail] })).toEqual(['PR 10']);
    expect(await list({ authorEmails: ['BOB@ACME.FR'] })).toEqual(['PR 11', 'Page cadrage']);
    expect(await list({ tools: ['github'], since: daysAgo(3) })).toEqual(['PR 11']);
    expect(await list({ tools: ['gitlab'] })).toEqual([]);
  });
});
