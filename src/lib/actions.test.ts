import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, ACTION_KINDS, actionWarnings, parseActionView } from './actions';
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

    // Le contenu entier du fichier reste en base : la page ne le reçoit pas.
    const { content: _content, ...shown } = params;

    expect(parseActionView({ ...write, params })?.params).toEqual(shown);
    expect(
      parseActionView({ ...write, params: { ...params, sha: 'b'.repeat(40) } })?.params,
    ).toEqual({ ...shown, sha: 'b'.repeat(40) });
    expect(parseActionView({ ...write, params: { ...params, diff: 12 } })).toBeNull();
  });

  it('retire un lien qui n’est ni http ni https, et une raison inconnue', () => {
    const parsed = parseActionView({
      ...action,
      result: { url: 'javascript:alert(1)', error: 'texte de GitHub' },
    });
    expect(parsed?.result).toEqual({ url: null, error: null });
  });

  it('garde les raisons ajoutées pour les conflits, les refus et les écritures incertaines', () => {
    for (const error of ['conflit', 'refus', 'incertain']) {
      expect(
        parseActionView({ ...action, status: 'echouee', result: { error } })?.result.error,
      ).toBe(error);
    }
  });

  it('garde « asked » et « default » quand ils sont présents, et les écarte sur une action qui ne les porte pas', () => {
    const write = {
      id: 'a3',
      kind: 'github.supprimer_fichier',
      status: 'proposee',
      result: null,
      params: {
        repo: 'acme/leon',
        branch: 'main',
        path: 'a.md',
        message: 'm',
        sha: 'b'.repeat(40),
        lines: '3',
        asked: 'Supprime a.md',
        default: 'oui',
      },
    };

    expect(parseActionView(write)?.params).toMatchObject({
      asked: 'Supprime a.md',
      default: 'oui',
    });
    expect(
      parseActionView({ ...action, params: { ...action.params, default: 'oui' } })?.params,
    ).not.toHaveProperty('default');
  });

  it('exige la branche visée d’une fusion', () => {
    const merge = {
      id: 'a4',
      kind: 'github.fusionner_pr',
      status: 'proposee',
      result: null,
      params: { repo: 'acme/leon', number: '7', title: 'T', method: 'merge', sha: 'b'.repeat(40) },
    };

    expect(parseActionView(merge)).toBeNull();
    expect(parseActionView({ ...merge, params: { ...merge.params, base: 'main' } })).not.toBeNull();
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

describe('actionWarnings', () => {
  const file = { repo: 'acme/leon', branch: 'feature/x', path: 'src/a.ts' };

  it('ne dit rien d’une écriture ordinaire', () => {
    expect(actionWarnings('github.ecrire_fichier', file)).toEqual([]);
    expect(actionWarnings('github.creer_branche', { repo: 'acme/leon' })).toEqual([]);
  });

  it('dit qu’une écriture sur la branche par défaut se fait sans PR', () => {
    expect(actionWarnings('github.ecrire_fichier', { ...file, default: 'oui' })).toEqual([
      'defaultBranchWarning',
    ]);
    expect(actionWarnings('github.supprimer_fichier', { ...file, default: 'oui' })).toEqual([
      'defaultBranchWarning',
    ]);
  });

  it('dit qu’un workflow GitHub Actions peut exécuter du code dès le commit', () => {
    for (const kind of ['github.ecrire_fichier', 'github.supprimer_fichier'] as const) {
      expect(actionWarnings(kind, { ...file, path: '.github/workflows/ci.yml' })).toEqual([
        'workflowWarning',
      ]);
    }
    expect(
      actionWarnings('github.ecrire_fichier', { ...file, path: 'docs/.github/workflows/a' }),
    ).toEqual([]);
  });

  it('cumule les avertissements, et garde celui d’une relance', () => {
    expect(
      actionWarnings('github.ecrire_fichier', {
        ...file,
        path: '.github/workflows/ci.yml',
        default: 'oui',
      }),
    ).toEqual(['defaultBranchWarning', 'workflowWarning']);
    expect(actionWarnings('github.relancer_execution', { repo: 'acme/leon' })).toEqual([
      'rerunWarning',
    ]);
  });
});
