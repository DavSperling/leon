import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Tx } from '@/server/db/with-tenant';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { searchPassages } from './search';

// Une base dont l'extension `vector` refuse le réglage de la recherche (pgvector avant 0.8 : le paramètre
// `hnsw.iterative_scan` n'existe pas) : la recherche ne s'arrête pas, elle répond au plein texte seul, comme
// quand le fournisseur de vecteurs tombe (vigilance 5 du plan).

const state = vi.hoisted(() => ({ refuseSettings: false }));

// Le refus est une vraie erreur de Postgres, qui abandonne la transaction comme sur pgvector 0.7 : quand la
// recherche règle `hnsw.iterative_scan`, la base reçoit à la place le réglage d'un paramètre `hnsw.` qui
// n'existe pas, une fois l'extension chargée dans la connexion (le préfixe n'accepte alors que ses paramètres).
vi.mock('@/server/db/with-tenant', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/server/db/with-tenant')>();
  const { sql } = await import('drizzle-orm');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const refusing = (tx: Tx): Tx =>
    new Proxy(tx, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === 'transaction') {
          return (run: (inner: Tx) => Promise<unknown>) =>
            target.transaction((inner) => run(refusing(inner)));
        }
        if (property === 'execute') {
          return async (query: Parameters<Tx['execute']>[0]) => {
            const text = typeof query === 'string' ? query : dialect.sqlToQuery(query.getSQL()).sql;
            if (state.refuseSettings && text.includes('hnsw.iterative_scan')) {
              await target.execute(sql`select '[1,2]'::halfvec(2)`);
              return target.execute(sql`set local hnsw.inexistant = 1`);
            }
            return target.execute(query);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  return {
    ...original,
    withTenant: <T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) =>
      original.withTenant(ctx, (tx) => fn(refusing(tx))),
  };
});

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
beforeEach(() => {
  state.refuseSettings = false;
});
afterEach(() => vi.restoreAllMocks());

const factice = createFakeEmbedder();
const NOW = new Date('2026-10-19T10:00:00Z');

async function aliceWithTicket() {
  const { members } = await newTeam(['Alice'], tenantIds);
  const [alice] = members as [TenantContext];
  await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
  return alice;
}

describe('réglage des vecteurs refusé par la base', () => {
  it('sert de témoin : sans refus, la recherche est hybride', async () => {
    const alice = await aliceWithTicket();
    const page = await searchPassages(alice, {
      query: 'quetzalcoatl',
      embedder: factice,
      now: NOW,
    });
    expect(page.mode).toBe('hybride');
    expect(page.hits.map((hit) => hit.title)).toEqual(['Ticket']);
  });

  it('répond au plein texte seul, sans exception, et le dit', async () => {
    const alice = await aliceWithTicket();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.refuseSettings = true;
    const page = await searchPassages(alice, {
      query: 'quetzalcoatl',
      embedder: factice,
      now: NOW,
    });
    expect(page.mode).toBe('plein-texte');
    expect(page.hits.map((hit) => hit.title)).toEqual(['Ticket']);
    expect(page.totalSources).toBe(1);
    // L'incident est journalisé, sans la requête ni le texte de la base.
    expect(logged).toHaveBeenCalledWith(
      '[leon]',
      'search.vector_settings_failed',
      expect.any(String),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('quetzalcoatl');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('hnsw');
  });

  it('ne change rien à une recherche sans fournisseur de vecteurs', async () => {
    const alice = await aliceWithTicket();
    state.refuseSettings = true;
    const page = await searchPassages(alice, { query: 'quetzalcoatl', embedder: null, now: NOW });
    expect(page.mode).toBe('plein-texte');
    expect(page.hits.map((hit) => hit.title)).toEqual(['Ticket']);
  });
});
