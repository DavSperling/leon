import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import type { LlmStep } from './llm';
import {
  EFFORT_BY_STEP,
  modelForStep,
  modelSpec,
  pickModel,
  SUPPORTED_MODEL_IDS,
  SUPPORTED_MODELS,
} from './models';

describe('modelForStep', () => {
  const env = parseEnv(TEST_ENV);

  const steps: LlmStep[] = [
    'reponse',
    'discussion',
    'point',
    'resume',
    'fil',
    'agenda',
    'fiche',
    'brouillon',
  ];
  const models = (reglee: typeof env) =>
    Object.fromEntries(steps.map((step) => [step, modelForStep(step, reglee)]));
  // Le mieux noté des modèles Claude au banc (docs/etudes/resumes-2026-11) : Sonnet, sauf pour la discussion (Opus)
  // et l'agenda (Haiku).
  const CLAUDE = {
    reponse: 'claude-sonnet-5-5',
    discussion: 'claude-opus-5-5',
    point: 'claude-sonnet-5-5',
    resume: 'claude-sonnet-5-5',
    fil: 'claude-sonnet-5-5',
    agenda: 'claude-haiku-5-5',
    fiche: 'claude-sonnet-5-5',
    brouillon: 'claude-sonnet-5-5',
  };

  it('prend Sonnet 5.5 pour chaque étape, sauf Opus 5.5 pour la discussion et Haiku 5.5 pour l’agenda', () => {
    expect(models(env)).toEqual(CLAUDE);
  });

  it('garde Claude partout avec la clé OpenRouter : elle ne sert qu’aux étapes réglées sur un de ses modèles', () => {
    expect(models(parseEnv({ ...TEST_ENV, OPENROUTER_API_KEY: 'cle-de-test' }))).toEqual(CLAUDE);
  });

  it('suit la variable de chaque étape, et d’elle seule', () => {
    expect(models(parseEnv({ ...TEST_ENV, LEON_MODEL_DISCUSSION: 'claude-sonnet-5-5' }))).toEqual({
      ...CLAUDE,
      discussion: 'claude-sonnet-5-5',
    });
    expect(
      models(
        parseEnv({
          ...TEST_ENV,
          LEON_MODEL_REPONSE: 'claude-haiku-5-5',
          LEON_MODEL_POINT: 'claude-opus-5-5',
          LEON_MODEL_RESUME: 'claude-haiku-5-5',
          LEON_MODEL_FIL: 'claude-opus-5-5',
          LEON_MODEL_AGENDA: 'claude-sonnet-5-5',
          LEON_MODEL_FICHE: 'claude-opus-5-5',
          LEON_MODEL_BROUILLON: 'claude-haiku-5-5',
        }),
      ),
    ).toEqual({
      reponse: 'claude-haiku-5-5',
      discussion: 'claude-opus-5-5',
      point: 'claude-opus-5-5',
      resume: 'claude-haiku-5-5',
      fil: 'claude-opus-5-5',
      agenda: 'claude-sonnet-5-5',
      fiche: 'claude-opus-5-5',
      brouillon: 'claude-haiku-5-5',
    });
  });

  it('retombe sur le modèle par défaut quand la variable est vide', () => {
    const videe = parseEnv({ ...TEST_ENV, LEON_MODEL_DISCUSSION: '' });
    expect(modelForStep('discussion', videe)).toBe('claude-opus-5-5');
  });
});

// La table « préférée » peut nommer un modèle d'OpenRouter : sans la clé, l'étape garde son modèle Anthropic.
describe('pickModel', () => {
  const anthropic = {
    reponse: 'claude-haiku-5-5',
    discussion: 'claude-sonnet-5-5',
    point: 'claude-sonnet-5-5',
    resume: 'claude-haiku-5-5',
    fil: 'claude-haiku-5-5',
    agenda: 'claude-haiku-5-5',
    fiche: 'claude-haiku-5-5',
    brouillon: 'claude-haiku-5-5',
  } as const satisfies Record<LlmStep, string>;
  const preferred = {
    ...anthropic,
    reponse: 'openai/gpt-6-luna',
    point: 'claude-opus-5-5',
  } as const;

  it('prend le modèle préféré d’OpenRouter quand la clé est là', () => {
    const env = parseEnv({ ...TEST_ENV, OPENROUTER_API_KEY: 'cle-de-test' });
    expect(pickModel('reponse', env, preferred, anthropic)).toBe('openai/gpt-6-luna');
    expect(pickModel('point', env, preferred, anthropic)).toBe('claude-opus-5-5');
  });

  it('retombe sur le modèle Anthropic de l’étape sans la clé OpenRouter', () => {
    const env = parseEnv(TEST_ENV);
    expect(pickModel('reponse', env, preferred, anthropic)).toBe('claude-haiku-5-5');
    expect(pickModel('point', env, preferred, anthropic)).toBe('claude-opus-5-5');
  });

  it('suit la variable de l’étape avant la table', () => {
    const env = parseEnv({ ...TEST_ENV, LEON_MODEL_REPONSE: 'claude-sonnet-5-5' });
    expect(pickModel('reponse', env, preferred, anthropic)).toBe('claude-sonnet-5-5');
    const avecCle = parseEnv({
      ...TEST_ENV,
      OPENROUTER_API_KEY: 'cle-de-test',
      LEON_MODEL_FIL: 'z-ai/glm-5.3-flash',
    });
    expect(pickModel('fil', avecCle, preferred, anthropic)).toBe('z-ai/glm-5.3-flash');
    expect(modelForStep('fil', avecCle)).toBe('z-ai/glm-5.3-flash');
  });
});

describe('les modèles d’OpenRouter dans l’environnement', () => {
  it('refuse de démarrer quand LEON_MODEL_* nomme un modèle d’OpenRouter sans OPENROUTER_API_KEY', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_MODEL_POINT: 'openai/gpt-6.2-sol' })).toThrow(
      /LEON_MODEL_POINT.*OPENROUTER_API_KEY/s,
    );
  });

  it('accepte un modèle d’OpenRouter avec la clé', () => {
    const env = parseEnv({
      ...TEST_ENV,
      OPENROUTER_API_KEY: 'cle-de-test',
      LEON_MODEL_POINT: 'openai/gpt-6.2-sol',
    });
    expect(modelForStep('point', env)).toBe('openai/gpt-6.2-sol');
  });
});

describe('EFFORT_BY_STEP', () => {
  it('fixe l’effort de chaque étape : son défaut varie selon le modèle', () => {
    expect(EFFORT_BY_STEP).toEqual({
      reponse: 'low',
      discussion: 'medium',
      point: 'medium',
      resume: 'low',
      fil: 'low',
      agenda: 'low',
      fiche: 'medium',
      brouillon: 'medium',
    });
  });
});

// Un seul endroit dit ce que Leon sait faire de chaque modèle : le repli serveur des refus, le tarif. Un modèle
// qui n'y figure pas ne peut pas être réglé (env.ts le refuse au démarrage).
describe('SUPPORTED_MODELS', () => {
  it('liste les trois modèles Claude de la spec et les modèles d’OpenRouter du banc', () => {
    expect([...SUPPORTED_MODEL_IDS].sort()).toEqual([
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4.1-flash-1017',
      'minimax/minimax-m3.1-flash',
      'openai/gpt-6-luna',
      'openai/gpt-6.1-terra',
      'openai/gpt-6.2-sol',
      'xiaomi/mimo-v2.6-flash',
      'z-ai/glm-5.3-flash',
    ]);
    expect(Object.keys(SUPPORTED_MODELS).sort()).toEqual([...SUPPORTED_MODEL_IDS].sort());
  });

  it('donne le repli serveur des refus à Sonnet et à Opus, pas à Haiku', () => {
    expect(modelSpec('claude-sonnet-5-5')?.refusalFallback).toBe(true);
    expect(modelSpec('claude-opus-5-5')?.refusalFallback).toBe(true);
    expect(modelSpec('claude-haiku-5-5')?.refusalFallback).toBe(false);
    expect(modelSpec('openai/gpt-6-luna')?.refusalFallback).toBe(false);
  });

  it('sert les modèles Claude par Anthropic, les autres par OpenRouter', () => {
    for (const id of SUPPORTED_MODEL_IDS) {
      expect(SUPPORTED_MODELS[id].provider, id).toBe(
        id.startsWith('claude-') ? 'anthropic' : 'openrouter',
      );
    }
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
