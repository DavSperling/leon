import { describe, expect, it } from 'vitest';
import { parseActionView } from './actions';
import { parseDiscussionEvent } from './discussion-events';

const action = {
  id: 'a1',
  kind: 'github.creer_branche',
  params: { repo: 'acme/leon', branch: 'feature/x', from: 'main', sha: 'abc1234' },
  status: 'faite',
  result: { url: 'https://github.com/acme/leon/tree/feature/x', error: null },
};

describe('parseActionView', () => {
  it('garde une action du contrat, sans ses champs inconnus', () => {
    expect(parseActionView({ ...action, connectionId: 'c1', createdAt: '2026-10-27' })).toEqual(
      action,
    );
  });

  it('écarte une action d’un autre type, d’un état inconnu ou sans ses paramètres', () => {
    expect(parseActionView({ ...action, kind: 'github.supprimer_depot' })).toBeNull();
    expect(parseActionView({ ...action, status: 'faite-par-magie' })).toBeNull();
    expect(parseActionView({ ...action, params: { repo: 'acme/leon' } })).toBeNull();
  });

  it('retire un lien qui n’est ni http ni https, et une raison inconnue', () => {
    const parsed = parseActionView({
      ...action,
      result: { url: 'javascript:alert(1)', error: 'texte de GitHub' },
    });
    expect(parsed?.result).toEqual({ url: null, error: null });
  });

  it('lit l’évènement « actions » du flux de la discussion', () => {
    expect(parseDiscussionEvent(JSON.stringify({ type: 'actions', items: [action, {}] }))).toEqual({
      type: 'actions',
      items: [action],
    });
  });
});
