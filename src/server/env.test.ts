import { randomBytes } from 'node:crypto';
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

  it('accepte une clé des connecteurs de 32 octets en base64', () => {
    const key = randomBytes(32).toString('base64');
    expect(parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key }).LEON_CONNECTORS_KEY).toBe(key);
  });

  it('rejette une clé des connecteurs de 16 octets', () => {
    const key = randomBytes(16).toString('base64');
    expect(() => parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key })).toThrow(
      /LEON_CONNECTORS_KEY/,
    );
  });

  it('rejette une clé des connecteurs de 33 octets', () => {
    const key = randomBytes(33).toString('base64');
    expect(() => parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key })).toThrow();
  });

  it("accepte l'absence de clé des connecteurs", () => {
    const { LEON_CONNECTORS_KEY: _, ...sansCle } = TEST_ENV;
    expect(parseEnv(sansCle).LEON_CONNECTORS_KEY).toBeUndefined();
  });

  it('traite une clé des connecteurs vide comme une absence', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: '' }).LEON_CONNECTORS_KEY).toBeUndefined();
  });
});
