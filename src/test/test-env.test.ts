import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { EnvSchema } from '@/server/env';
import {
  MIGRATIONS_DESTRUCTIVES,
  refuseMigrationsDestructives,
  TEST_ENV,
  testDatabaseName,
} from './test-env';

// Le nom de la base de test se règle par LEON_TEST_DATABASE (défaut leon_test) : le deuxième jet
// travaille sur leon_test_glean pour ne pas toucher la base que partagent les autres branches.
async function loadTestEnv() {
  vi.resetModules();
  return (await import('./test-env')).TEST_ENV;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TEST_ENV', () => {
  it('vise leon_test quand LEON_TEST_DATABASE est absent', async () => {
    vi.stubEnv('LEON_TEST_DATABASE', undefined);
    const env = await loadTestEnv();
    expect(env.DATABASE_URL).toMatch(/\/leon_test$/);
    expect(env.DATABASE_URL_ADMIN).toMatch(/\/leon_test$/);
  });

  it('vise la base nommée par LEON_TEST_DATABASE, pour les deux rôles', async () => {
    vi.stubEnv('LEON_TEST_DATABASE', 'leon_test_glean');
    const env = await loadTestEnv();
    expect(env.DATABASE_URL).toBe('postgres://leon_app:leon_app@127.0.0.1:54329/leon_test_glean');
    expect(env.DATABASE_URL_ADMIN).toBe(
      'postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test_glean',
    );
  });

  // Vitest range TEST_ENV dans process.env, et env.ts valide process.env à l'import : une variable exportée dans
  // le shell (essai d'un fournisseur de vecteurs, d'une clé Anthropic ou d'un faux modèle) changerait
  // l'environnement des tests, jusqu'à un appel réseau vers un vrai modèle. Vide vaut absent.
  it.each([
    'LEON_EMBEDDINGS',
    'VOYAGE_API_KEY',
    'MISTRAL_API_KEY',
    'LEON_BGE_URL',
    'LEON_LLM',
    'ANTHROPIC_API_KEY',
    'LEON_MODEL_REPONSE',
    'LEON_MODEL_DISCUSSION',
    'LEON_MODEL_POINT',
    'LEON_MODEL_RESUME',
  ])('vide %s : une valeur exportée dans le shell ne passe pas dans les tests', (name) => {
    expect((TEST_ENV as Record<string, string>)[name]).toBe('');
    expect(process.env[name]).toBe('');
  });

  // Une variable que la tâche suivante ajoute à env.ts ne doit pas pouvoir fuir du shell : elle figure ici dès
  // son ajout. Obligatoire : une valeur fixe. Facultative : vide (absente), sauf celles qui ont une valeur fixe
  // de test. NODE_ENV est posé par Vitest lui-même (« test ») ; NEXT_PHASE, par Next seul.
  it('couvre chaque variable du schéma d’environnement', () => {
    const FACULTATIVES_A_VALEUR_FIXE = ['LEON_CONNECTORS_KEY', 'LEON_IP_HEADER'];
    const fields = EnvSchema.shape as Record<string, z.ZodType>;
    const values = TEST_ENV as Record<string, string | undefined>;
    const problems: string[] = [];
    for (const [name, field] of Object.entries(fields)) {
      if (name === 'NODE_ENV' || name === 'NEXT_PHASE') continue;
      const value = values[name];
      const facultative = field.safeParse(undefined).success;
      if (value === undefined) problems.push(`${name} : absente de TEST_ENV`);
      else if (!facultative && value === '') problems.push(`${name} : obligatoire, sans valeur`);
      else if (facultative && value !== '' && !FACULTATIVES_A_VALEUR_FIXE.includes(name)) {
        problems.push(`${name} : facultative, elle doit valoir '' dans TEST_ENV`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.each([
    'leon',
    'postgres',
    'leon_prod',
    'LEON_TEST',
    'leon_test/leon',
    'leon_test?sslmode=disable',
    'leon_test@autre-hote',
    '',
  ])('refuse la base « %s » : ce n’est pas une base de test', async (name) => {
    vi.stubEnv('LEON_TEST_DATABASE', name);
    await expect(loadTestEnv()).rejects.toThrow(/LEON_TEST_DATABASE/);
  });
});

describe('testDatabaseName', () => {
  it('accepte leon_test et les bases dont le nom en part', () => {
    expect(testDatabaseName(undefined)).toBe('leon_test');
    expect(testDatabaseName('leon_test')).toBe('leon_test');
    expect(testDatabaseName('leon_test_glean')).toBe('leon_test_glean');
  });

  it('refuse la base de développement et tout nom qui changerait l’adresse de connexion', () => {
    for (const name of ['leon', 'leon_test/x', 'leon_test?x=1', 'leon_test#x', '']) {
      expect(() => testDatabaseName(name), name).toThrow(/LEON_TEST_DATABASE/);
    }
  });
});

describe('refuseMigrationsDestructives', () => {
  const pending = ['0010-suppression-tri.sql'];

  it('liste la migration qui supprime le tri', () => {
    expect(MIGRATIONS_DESTRUCTIVES).toContain('0010-suppression-tri.sql');
  });

  it('refuse leon_test, base partagée, tant qu’une migration destructive n’y est pas appliquée', () => {
    const refusal = refuseMigrationsDestructives({
      database: 'leon_test',
      pending,
      accepted: false,
    });
    expect(refusal).toContain('0010-suppression-tri.sql');
    expect(refusal).toContain('LEON_TEST_DATABASE');
  });

  it('accepte leon_test_glean : cette base est celle de la branche', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test_glean', pending, accepted: false }),
    ).toBeNull();
  });

  it('accepte leon_test quand la migration y est déjà appliquée (rien en attente)', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test', pending: [], accepted: false }),
    ).toBeNull();
  });

  it('accepte leon_test quand l’équipe a décidé de le migrer (variable explicite)', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test', pending, accepted: true }),
    ).toBeNull();
  });
});
