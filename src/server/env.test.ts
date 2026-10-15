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

  it('traite une clé OpenRouter vide comme une absence', () => {
    expect(parseEnv({ ...TEST_ENV, OPENROUTER_API_KEY: '' }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it.each([
    'anthropic:claude-sonnet-5-5',
    'openrouter:mistralai/mistral-large-4-0',
    'openrouter:openai/gpt-5.4-mini',
    'openrouter:anthropic/claude-haiku-5.5',
  ])('accepte le modèle %s pour une étape', (choix) => {
    const env = parseEnv({
      ...TEST_ENV,
      LEON_LLM_TRIAGE: choix,
      LEON_LLM_EXTRACTION: choix,
      LEON_LLM_RANGEMENT: choix,
    });
    expect([env.LEON_LLM_TRIAGE, env.LEON_LLM_EXTRACTION, env.LEON_LLM_RANGEMENT]).toEqual([
      choix,
      choix,
      choix,
    ]);
  });

  it('traite un modèle vide comme le modèle par défaut', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_LLM_EXTRACTION: '' }).LEON_LLM_EXTRACTION).toBeUndefined();
  });

  it.each([
    'claude-sonnet-5-5',
    'mistral:mistral-large',
    'openrouter:mistral-large-4-0',
    'anthropic:',
    'openrouter:mistralai/',
  ])('rejette le modèle mal formé %s', (choix) => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_LLM_EXTRACTION: choix })).toThrow(
      /anthropic:<modèle> ou openrouter:<fournisseur>\/<modèle>/,
    );
  });

  it.each([
    'openrouter:anthropic/claude-haiku-5.5:batch',
    'openrouter:openai/gpt-5.5-pro',
    'openrouter:openai/gpt-5.6-sol-pro',
    'openrouter:openai/gpt-5.4-pro:batch',
  ])('rejette la variante %s (lot différé ou modèle -pro hors de prix)', (choix) => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_LLM_EXTRACTION: choix })).toThrow(
      /variantes :batch et modèles -pro refusés/,
    );
  });

  it('accepte un modèle dont le nom contient « pro » ailleurs', () => {
    expect(
      parseEnv({ ...TEST_ENV, LEON_LLM_EXTRACTION: 'openrouter:acme/produit-pro2' })
        .LEON_LLM_EXTRACTION,
    ).toBe('openrouter:acme/produit-pro2');
  });
});
