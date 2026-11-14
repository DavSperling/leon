import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { renderBriefing } from '@/server/briefing/briefing-prompt';
import { briefings, passages } from '@/server/db/schema/search';
import { adminDb } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { briefingSources, citationDetails, homeBriefing } from './citation-sources';

// Ce que l'écran montre d'une source citée (l'outil, « Vous seul », le passage pour le surligneur), relu sous les
// droits du lecteur : une source qu'il ne voit pas ne dit rien.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const firstPassage = async (sourceId: string) => {
  const [row] = await adminDb
    .select({ id: passages.id })
    .from(passages)
    .where(eq(passages.sourceId, sourceId))
    .orderBy(asc(passages.ord))
    .limit(1);
  if (!row) throw new Error('passage de test introuvable');
  return row.id;
};

describe('les détails d’une citation', () => {
  it('disent l’outil, qui voit la source et le passage, sous les droits du lecteur', async () => {
    const { tenantId, members } = await newTeam(['Alice', 'Bruno'], tenantIds);
    const [alice, bruno] = members as [TenantContext, TenantContext];
    const mine = await seedIndexed(alice, {
      kind: 'notion',
      acl: [alice.userId],
      turns: [{ text: 'La livraison de la V2 est prévue le 15 novembre.' }],
    });
    const team = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      turns: [{ text: 'La migration reste ouverte.' }],
    });
    const brunos = await seedIndexed(bruno, {
      kind: 'linear',
      acl: [bruno.userId],
      turns: [{ text: 'Le devis de Bruno.' }],
    });
    const [p1, p2, p3] = await Promise.all([
      firstPassage(mine.sourceId),
      firstPassage(team.sourceId),
      firstPassage(brunos.sourceId),
    ]);

    const details = await citationDetails(alice, [p1, p2, p3, 'pas-un-uuid']);
    expect(details.get(p1)).toEqual({
      kind: 'notion',
      visibility: 'moi',
      passage: expect.stringContaining('15 novembre'),
    });
    expect(details.get(p2)).toMatchObject({ kind: 'github', visibility: 'equipe' });
    // la source privée de Bruno n'existe pas pour Alice
    expect(details.has(p3)).toBe(false);
    expect(details.size).toBe(2);
    expect((await citationDetails(bruno, [p1])).size).toBe(0);
    expect((await citationDetails(alice, [])).size).toBe(0);
  });

  it('numérotent les sources d’un point dans l’ordre reçu, avec leur premier passage', async () => {
    const { tenantId, members } = await newTeam(['Alice', 'Bruno'], tenantIds);
    const [alice, bruno] = members as [TenantContext, TenantContext];
    const one = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket 1',
      metadata: { url: 'https://github.com/acme/leon/issues/1' },
    });
    const hidden = await seedIndexed(bruno, { kind: 'linear', acl: [bruno.userId] });
    const three = await seedIndexed(alice, { kind: 'claude_code', acl: [alice.userId] });

    const listed = await briefingSources(alice, [one.sourceId, hidden.sourceId, three.sourceId]);
    expect(listed.map((source) => [source.n, source.sourceId])).toEqual([
      [1, one.sourceId],
      [3, three.sourceId],
    ]);
    expect(listed[0]).toMatchObject({
      title: 'Ticket 1',
      url: 'https://github.com/acme/leon/issues/1',
      kind: 'github',
      visibility: 'equipe',
      passageId: await firstPassage(one.sourceId),
    });
    expect(listed[1]?.visibility).toBe('moi');
  });
});

describe('le point du matin de l’Accueil', () => {
  it('rend ses trois parties et ses sources, sans compter la vue comme une lecture', async () => {
    const { tenantId, members } = await newTeam(['Alice', 'Bruno'], tenantIds);
    const [alice, bruno] = members as [TenantContext, TenantContext];
    expect(await homeBriefing(alice)).toBeNull();

    const one = await seedIndexed(alice, { kind: 'github', acl: [tenantId], title: 'Ticket 1' });
    const markdown = renderBriefing({
      project: 'github.com/acme/leon',
      preparedAt: new Date('2026-11-12T06:00:00.000Z'),
      body: '## What you did\n- Renewed the deploy token [1].',
      references: [],
    });
    const [row] = await adminDb
      .insert(briefings)
      .values({
        tenantId,
        userId: alice.userId,
        project: 'github.com/acme/leon',
        markdown,
        sourceIds: [one.sourceId],
        preparedAt: new Date(),
        acl: [alice.userId],
      })
      .returning({ id: briefings.id });

    const shown = await homeBriefing(alice);
    expect(shown?.sections).toEqual([
      { title: 'What you did', lines: [{ text: 'Renewed the deploy token.', refs: [1] }] },
    ]);
    expect(shown?.sources).toMatchObject([{ n: 1, sourceId: one.sourceId, title: 'Ticket 1' }]);
    // l'heure où il a été préparé, écrite à côté du titre
    expect(shown?.preparedAt).toBeInstanceOf(Date);
    const [after] = await adminDb
      .select({ lastReadAt: briefings.lastReadAt })
      .from(briefings)
      .where(eq(briefings.id, row?.id ?? ''));
    expect(after?.lastReadAt).toBeNull();
    // le point d'Alice n'existe pas pour Bruno
    expect(await homeBriefing(bruno)).toBeNull();

    // une source qui n'est plus visible : le point n'est plus montré
    const hidden = await seedIndexed(bruno, { kind: 'linear', acl: [bruno.userId] });
    await adminDb
      .update(briefings)
      .set({ sourceIds: [one.sourceId, hidden.sourceId] })
      .where(eq(briefings.id, row?.id ?? ''));
    expect(await homeBriefing(alice)).toBeNull();
  });
});
