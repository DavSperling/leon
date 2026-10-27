import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, ACTION_KINDS, parseActionView } from './actions';
import { parseDiscussionEvent } from './discussion-events';

const action = {
  id: 'a1',
  kind: 'github.creer_branche',
  params: { repo: 'acme/leon', branch: 'feature/x', from: 'main', sha: 'abc1234' },
  status: 'faite',
  result: { url: 'https://github.com/acme/leon/tree/feature/x', error: null },
};

describe('parseActionView', () => {
  it('garde une action du contrat, sans ses champs ni ses paramètres inconnus', () => {
    const noisy = { ...action, connectionId: 'c1', createdAt: '2026-10-27' };
    noisy.params = { ...action.params, secret: 'x' } as typeof action.params;

    expect(parseActionView(noisy)).toEqual(action);
  });

  it('écarte une action d’un autre type, d’un état inconnu ou sans ses paramètres obligatoires', () => {
    expect(parseActionView({ ...action, kind: 'github.supprimer_depot' })).toBeNull();
    expect(parseActionView({ ...action, status: 'faite-par-magie' })).toBeNull();
    expect(parseActionView({ ...action, params: { repo: 'acme/leon' } })).toBeNull();
    expect(parseActionView({ ...action, params: null })).toBeNull();
  });

  it('ne garde que les valeurs en texte, les vides comprises, et les paramètres facultatifs présents', () => {
    const write = {
      id: 'a2',
      kind: 'github.ecrire_fichier',
      status: 'proposee',
      result: null,
    };
    const params = {
      repo: 'acme/leon',
      branch: 'x',
      path: 'a.md',
      message: 'm',
      content: '',
      diff: '+ a',
    };

    expect(parseActionView({ ...write, params })?.params).toEqual(params);
    expect(
      parseActionView({ ...write, params: { ...params, sha: 'b'.repeat(40) } })?.params,
    ).toEqual({ ...params, sha: 'b'.repeat(40) });
    expect(parseActionView({ ...write, params: { ...params, diff: 12 } })).toBeNull();
  });

  it('retire un lien qui n’est ni http ni https, et une raison inconnue', () => {
    const parsed = parseActionView({
      ...action,
      result: { url: 'javascript:alert(1)', error: 'texte de GitHub' },
    });
    expect(parsed?.result).toEqual({ url: null, error: null });
  });

  it('garde les deux raisons ajoutées pour les conflits et les refus', () => {
    for (const error of ['conflit', 'refus']) {
      expect(
        parseActionView({ ...action, status: 'echouee', result: { error } })?.result.error,
      ).toBe(error);
    }
  });

  it('lit l’évènement « actions » du flux de la discussion', () => {
    expect(parseDiscussionEvent(JSON.stringify({ type: 'actions', items: [action, {}] }))).toEqual({
      type: 'actions',
      items: [action],
    });
  });
});

describe('ACTION_KEYS', () => {
  it('décrit chaque type d’action, sans clé en double ni clé qui soit à la fois obligatoire et facultative', () => {
    expect(Object.keys(ACTION_KEYS).sort()).toEqual([...ACTION_KINDS].sort());
    for (const { required, optional } of Object.values(ACTION_KEYS)) {
      const all = [...required, ...optional];
      expect(new Set(all).size).toBe(all.length);
    }
  });
});
