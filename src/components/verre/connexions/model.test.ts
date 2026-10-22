import { describe, expect, test } from 'vitest';
import { connectedTools } from './model';
import { keepTogether, stateDetail } from './parts';

const view = {
  status: 'active' as const,
  lastSyncAt: null,
  itemsSynced: 0,
  lastError: null,
  createdBy: { id: 'u1', name: 'Julie' },
  creatorLeft: false,
};

describe('connexions', () => {
  test('connectedTools : les problèmes d’abord, puis la pause, puis l’ordre du catalogue', () => {
    const catalog = [{ id: 'github' }, { id: 'linear' }, { id: 'notion' }, { id: 'jira' }] as const;
    const conns = [
      { provider: 'notion', status: 'paused', creatorLeft: false },
      { provider: 'github', status: 'active', creatorLeft: false },
      { provider: 'jira', status: 'active', creatorLeft: true },
    ] as const;
    expect(connectedTools([...catalog], [...conns]).map((p) => p.id)).toEqual([
      'jira',
      'notion',
      'github',
    ]);
  });

  test('stateDetail : la raison sans le premier mot, rien en pause', () => {
    const now = new Date();
    expect(stateDetail({ ...view, status: 'error', lastError: 'Clé refusée.' }, now)).toBe(
      'Clé refusée.',
    );
    expect(stateDetail({ ...view, status: 'paused' }, now)).toBeNull();
    expect(stateDetail(view, now)).toBe('premier passage en attente');
  });

  test('keepTogether : ni « 18 / min » ni « · » en début de ligne', () => {
    expect(keepTogether('il y a 18 min · 418 éléments')).toBe('il y a 18 min · 418 éléments');
  });
});
