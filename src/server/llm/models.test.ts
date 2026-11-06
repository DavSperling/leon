import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import {
  EFFORT_BY_STEP,
  modelForStep,
  modelSpec,
  SUPPORTED_MODEL_IDS,
  SUPPORTED_MODELS,
} from './models';

describe('modelForStep', () => {
  const env = parseEnv(TEST_ENV);

  it('prend Haiku 5.5 pour la réponse en tête, appelée à chaque recherche', () => {
    expect(modelForStep('reponse', env)).toBe('claude-haiku-5-5');
  });

  it('prend Haiku 5.5 pour le résumé d’une session (D8)', () => {
    expect(modelForStep('resume', env)).toBe('claude-haiku-5-5');
  });

  it('suit LEON_MODEL_RESUME', () => {
    const reglee = parseEnv({ ...TEST_ENV, LEON_MODEL_RESUME: 'claude-sonnet-5-5' });
    expect(modelForStep('resume', reglee)).toBe('claude-sonnet-5-5');
    expect(modelForStep('reponse', reglee)).toBe('claude-haiku-5-5');
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
    expect(EFFORT_BY_STEP).toEqual({
      reponse: 'low',
      discussion: 'medium',
      point: 'medium',
      resume: 'low',
    });
  });
});

// Un seul endroit dit ce que Leon sait faire de chaque modèle : le repli serveur des refus, le tarif. Un modèle
// qui n'y figure pas ne peut pas être réglé (env.ts le refuse au démarrage).
describe('SUPPORTED_MODELS', () => {
  it('liste les trois modèles de la spec : Haiku 5.5, Sonnet 5.5 et Opus 5.5', () => {
    expect([...SUPPORTED_MODEL_IDS].sort()).toEqual([
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
    expect(Object.keys(SUPPORTED_MODELS).sort()).toEqual([...SUPPORTED_MODEL_IDS].sort());
  });

  it('donne le repli serveur des refus à Sonnet et à Opus, pas à Haiku', () => {
    expect(modelSpec('claude-sonnet-5-5')?.refusalFallback).toBe(true);
    expect(modelSpec('claude-opus-5-5')?.refusalFallback).toBe(true);
    expect(modelSpec('claude-haiku-5-5')?.refusalFallback).toBe(false);
  });

  it('chiffre chaque modèle : entrée, sortie, lecture et écriture du cache', () => {
    for (const id of SUPPORTED_MODEL_IDS) {
      const { price } = SUPPORTED_MODELS[id];
      expect(Object.keys(price).sort(), id).toEqual(['cacheRead', 'cacheWrite', 'input', 'output']);
      expect(
        Object.values(price).every((value) => value > 0),
        id,
      ).toBe(true);
    }
  });

  it('ne connaît pas un modèle absent de la table : aucun repli ni tarif supposé', () => {
    expect(modelSpec('claude-haiku-4-5')).toBeUndefined();
    expect(modelSpec('claude-sonnet-4-6')).toBeUndefined();
    expect(modelSpec('')).toBeUndefined();
    // Une clé de l'objet, pas un modèle.
    expect(modelSpec('toString')).toBeUndefined();
  });
});
