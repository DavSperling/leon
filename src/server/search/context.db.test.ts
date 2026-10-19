import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { passages } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { fetchPassageContext, fetchSource } from './context';

// Le contexte d'un passage et la lecture d'une source, sous les droits du lecteur.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const BASE = new Date('2026-10-19T08:00:00Z');
const minutes = (n: number) => new Date(BASE.getTime() + n * 60_000);

async function team() {
  const { tenantId, members } = await newTeam(['Alice', 'Bob'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  return { tenantId, alice, bob };
}

// Sept tours courts, un passage chacun, datés de minute en minute.
async function sevenTurns(owner: TenantContext, extra: Parameters<typeof seedIndexed>[1] = {}) {
  return seedIndexed(owner, {
    title: 'Fil de sept messages',
    turns: Array.from({ length: 7 }, (_, index) => ({
      text: `message numéro ${index} du fil`,
      ts: minutes(index),
      authorName: `auteur-${index}`,
      role: index % 2 === 0 ? ('participant' as const) : ('document' as const),
    })),
    lastTurnAt: minutes(6),
    ...extra,
  });
}

const passageOfTurn = async (ctx: TenantContext, turnId: string) => {
  const [row] = await withTenant(ctx, (tx) =>
    tx.select({ id: passages.id }).from(passages).where(eq(passages.turnId, turnId)),
  );
  if (!row) throw new Error('passage introuvable');
  return row.id;
};

describe('fetchPassageContext', () => {
  it('rend le tour du passage, marqué, et deux tours avant et après', async () => {
    const { alice } = await team();
    const seeded = await sevenTurns(alice);
    const context = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[3] as string),
    );
    expect(context?.turns.map((turn) => turn.turnId)).toEqual(seeded.turnIds.slice(1, 6));
    expect(context?.turns.map((turn) => turn.isHit)).toEqual([false, false, true, false, false]);
    expect(context?.turns[2]).toEqual({
      turnId: seeded.turnIds[3],
      role: 'document',
      authorName: 'auteur-3',
      ts: minutes(3),
      text: 'message numéro 3 du fil',
      isHit: true,
    });
  });

  it('s’arrête aux bords de la source, et suit la fenêtre demandée', async () => {
    const { alice } = await team();
    const seeded = await sevenTurns(alice);
    const first = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[0] as string),
    );
    expect(first?.turns.map((turn) => turn.turnId)).toEqual(seeded.turnIds.slice(0, 3));
    const last = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[6] as string),
    );
    expect(last?.turns.map((turn) => turn.turnId)).toEqual(seeded.turnIds.slice(4, 7));
    const middle = await passageOfTurn(alice, seeded.turnIds[3] as string);
    const before = await fetchPassageContext(alice, middle, { before: 1, after: 0 });
    expect(before?.turns.map((turn) => turn.turnId)).toEqual(seeded.turnIds.slice(2, 4));
    const alone = await fetchPassageContext(alice, middle, { before: 0, after: 0 });
    expect(alone?.turns.map((turn) => turn.turnId)).toEqual([seeded.turnIds[3]]);
  });

  it('rend la source du passage : outil, nature, titre, lien, origine, dernière date', async () => {
    const { tenantId, alice } = await team();
    const seeded = await sevenTurns(alice, {
      kind: 'github',
      acl: [tenantId],
      metadata: {
        nature: 'ticket',
        url: 'https://github.com/acme/leon/issues/7',
        origin: { repo: 'acme/leon' },
      },
    });
    const context = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[2] as string),
    );
    expect(context?.source).toEqual({
      sourceId: seeded.sourceId,
      kind: 'github',
      nature: 'ticket',
      title: 'Fil de sept messages',
      url: 'https://github.com/acme/leon/issues/7',
      origin: { repo: 'acme/leon' },
      lastTs: minutes(6),
    });
  });

  it('prend la date du dernier tour quand la source n’en garde pas', async () => {
    const { alice } = await team();
    const seeded = await sevenTurns(alice, { lastTurnAt: undefined });
    const context = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[0] as string),
    );
    expect(context?.source.lastTs).toEqual(minutes(6));
  });

  it('place les tours dans l’ordre de leur date, même s’ils ont été écrits dans un autre', async () => {
    const { alice } = await team();
    const seeded = await seedIndexed(alice, {
      turns: [
        { text: 'troisième message', ts: minutes(30) },
        { text: 'premier message', ts: minutes(10) },
        { text: 'deuxième message', ts: minutes(20) },
      ],
    });
    const context = await fetchPassageContext(
      alice,
      await passageOfTurn(alice, seeded.turnIds[2] as string),
    );
    expect(context?.turns.map((turn) => turn.text)).toEqual([
      'premier message',
      'deuxième message',
      'troisième message',
    ]);
    expect(context?.turns.map((turn) => turn.isHit)).toEqual([false, true, false]);
  });

  it('rend null pour un passage invisible, inconnu ou mal écrit', async () => {
    const { alice, bob } = await team();
    const seeded = await sevenTurns(alice);
    const passageId = await passageOfTurn(alice, seeded.turnIds[3] as string);
    expect(await fetchPassageContext(bob, passageId)).toBeNull();
    expect(await fetchPassageContext(alice, randomUUID())).toBeNull();
    expect(await fetchPassageContext(alice, 'pas-un-identifiant')).toBeNull();
    expect(await fetchPassageContext(alice, "' or '1'='1")).toBeNull();
    expect(await fetchPassageContext(alice, passageId)).not.toBeNull();
  });
});

describe('fetchSource', () => {
  it('rend tous les tours d’une petite source, dans l’ordre', async () => {
    const { alice } = await team();
    const seeded = await sevenTurns(alice);
    const result = await fetchSource(alice, seeded.sourceId);
    expect(result?.truncated).toBe(false);
    expect(result?.source).toMatchObject({
      sourceId: seeded.sourceId,
      title: 'Fil de sept messages',
    });
    expect(result?.turns.map((turn) => turn.turnId)).toEqual(seeded.turnIds);
    expect(result?.turns.every((turn) => !turn.isHit)).toBe(true);
  });

  it('coupe à 20 000 caractères, au milieu d’un tour si besoin, et le dit', async () => {
    const { alice } = await team();
    const seeded = await seedIndexed(alice, {
      turns: Array.from({ length: 6 }, (_, index) => ({
        text: `${index}`.repeat(4500),
        ts: minutes(index),
      })),
    });
    const result = await fetchSource(alice, seeded.sourceId);
    expect(result?.truncated).toBe(true);
    const lengths = result?.turns.map((turn) => turn.text.length);
    expect(lengths).toEqual([4500, 4500, 4500, 4500, 2000]);
    expect(result?.turns.at(-1)?.text).toBe('4'.repeat(2000));
  });

  it('respecte la limite demandée, sans rien dire de coupé quand tout tient', async () => {
    const { alice } = await team();
    const seeded = await seedIndexed(alice, {
      turns: [
        { text: 'a'.repeat(500), ts: minutes(1) },
        { text: 'b'.repeat(500), ts: minutes(2) },
      ],
    });
    const exact = await fetchSource(alice, seeded.sourceId, { maxChars: 1000 });
    expect(exact?.truncated).toBe(false);
    expect(exact?.turns).toHaveLength(2);
    const short = await fetchSource(alice, seeded.sourceId, { maxChars: 600 });
    expect(short?.truncated).toBe(true);
    expect(short?.turns.map((turn) => turn.text.length)).toEqual([500, 100]);
    const tiny = await fetchSource(alice, seeded.sourceId, { maxChars: 10 });
    expect(tiny?.turns.map((turn) => turn.text.length)).toEqual([10]);
    expect(tiny?.truncated).toBe(true);
    // Un tour qui s'arrête juste à la limite, suivi d'un autre : coupé.
    const edge = await fetchSource(alice, seeded.sourceId, { maxChars: 500 });
    expect(edge?.turns).toHaveLength(1);
    expect(edge?.truncated).toBe(true);
  });

  it('ne coupe pas un émoji en deux', async () => {
    const { alice } = await team();
    const seeded = await seedIndexed(alice, {
      turns: [{ text: '😀'.repeat(100), ts: minutes(1) }],
    });
    const result = await fetchSource(alice, seeded.sourceId, { maxChars: 11 });
    expect(result?.turns[0]?.text).toBe('😀'.repeat(5));
    expect(result?.truncated).toBe(true);
  });

  it('rend null pour une source invisible, inconnue ou mal écrite', async () => {
    const { alice, bob } = await team();
    const seeded = await sevenTurns(alice);
    expect(await fetchSource(bob, seeded.sourceId)).toBeNull();
    expect(await fetchSource(alice, randomUUID())).toBeNull();
    expect(await fetchSource(alice, 'pas-un-identifiant')).toBeNull();
  });
});
