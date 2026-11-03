import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';

// Migration 0046 : une fonction security definer nomme pg_temp en dernier. Sans lui, Postgres lit pg_temp en premier,
// et une table temporaire du même nom qu'une table de public détournerait la fonction. Le test lit pg_proc : il vaut
// aussi pour les fonctions des migrations à venir.

describe('fonctions security definer', () => {
  it('ont toutes search_path = public, pg_temp', async () => {
    const { rows } = await adminPool.query<{ fonction: string; protegee: boolean }>(
      `select p.oid::regprocedure::text as fonction,
              coalesce('search_path=public, pg_temp' = any(p.proconfig), false) as protegee
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.protegee).map((row) => row.fonction)).toEqual([]);
  });
});
