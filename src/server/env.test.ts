import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepte un jeu valide', () => {
    const env = parseEnv(TEST_ENV);
    expect(env.DATABASE_URL).toBe(TEST_ENV.DATABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('rejette un secret Better Auth de 31 caractères', () => {
    expect(() => parseEnv({ ...TEST_ENV, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow();
  });

  it('rejette une DATABASE_URL absente', () => {
    const { DATABASE_URL: _, ...sansUrl } = TEST_ENV;
    expect(() => parseEnv(sansUrl)).toThrow();
  });

  it('rejette une DATABASE_URL qui ne vise pas Postgres', () => {
    expect(() => parseEnv({ ...TEST_ENV, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow();
  });

  it("accepte l'absence de clé Anthropic", () => {
    expect(parseEnv(TEST_ENV).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('traite une clé Anthropic vide comme une absence', () => {
    expect(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('garde une clé Anthropic renseignée', () => {
    expect(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: 'cle-de-test' }).ANTHROPIC_API_KEY).toBe(
      'cle-de-test',
    );
  });
});
