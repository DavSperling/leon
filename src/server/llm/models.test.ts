import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { EFFORT_BY_STEP, modelForStep } from './models';

describe('modelForStep', () => {
  const env = parseEnv(TEST_ENV);

  it('prend Haiku 5.5 pour la réponse en tête, appelée à chaque recherche', () => {
    expect(modelForStep('reponse', env)).toBe('claude-haiku-5-5');
  });

  it('prend Sonnet 5.5 pour la discussion et pour le point du matin', () => {
    expect(modelForStep('discussion', env)).toBe('claude-sonnet-5-5');
    expect(modelForStep('point', env)).toBe('claude-sonnet-5-5');
  });

  it('suit la variable de chaque étape, et d’elle seule', () => {
    const reglee = parseEnv({ ...TEST_ENV, LEON_MODEL_DISCUSSION: 'claude-opus-5-5' });
    expect(modelForStep('discussion', reglee)).toBe('claude-opus-5-5');
    expect(modelForStep('reponse', reglee)).toBe('claude-haiku-5-5');
    expect(modelForStep('point', reglee)).toBe('claude-sonnet-5-5');
  });

  it('suit LEON_MODEL_REPONSE et LEON_MODEL_POINT', () => {
    const reglee = parseEnv({
      ...TEST_ENV,
      LEON_MODEL_REPONSE: 'claude-sonnet-5-5',
      LEON_MODEL_POINT: 'claude-opus-5-5',
    });
    expect(modelForStep('reponse', reglee)).toBe('claude-sonnet-5-5');
    expect(modelForStep('point', reglee)).toBe('claude-opus-5-5');
  });

  it('retombe sur le modèle par défaut quand la variable est vide', () => {
    const videe = parseEnv({ ...TEST_ENV, LEON_MODEL_DISCUSSION: '' });
    expect(modelForStep('discussion', videe)).toBe('claude-sonnet-5-5');
  });
});

describe('EFFORT_BY_STEP', () => {
  it('fixe l’effort de chaque étape : son défaut varie selon le modèle', () => {
    expect(EFFORT_BY_STEP).toEqual({ reponse: 'low', discussion: 'medium', point: 'medium' });
  });
});
