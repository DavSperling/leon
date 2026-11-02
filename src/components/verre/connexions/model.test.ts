import { describe, expect, test } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { connectedTools, recommendedToConnect } from './model';
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

  test('keepTogether : de même en anglais', () => {
    expect(keepTogether('2 hr. ago · 418 items')).toBe('2 hr. ago · 418 items');
  });

  describe('recommendedToConnect', () => {
    // Seuls les champs que la règle lit.
    const tool = (id: string, over: Partial<CatalogItem> = {}) =>
      ({ id, privateRaw: false, available: true, ...over }) as unknown as CatalogItem;
    const catalog = [
      tool('github'),
      tool('linear'),
      tool('jira'),
      tool('notion'),
      tool('gmail', { privateRaw: true }),
      tool('slack', { available: false }),
    ];
    const conn = (provider: string, over: Partial<ConnectionView> = {}) =>
      ({
        provider,
        status: 'active',
        createdBy: { id: 'u2', name: 'Inès' },
        isCreator: false,
        creatorLeft: false,
        ...over,
      }) as unknown as ConnectionView;
    const ids = (list: CatalogItem[]) => list.map((p) => p.id);
    const recommend = (conns: ConnectionView[], wanted: string[]) =>
      ids(recommendedToConnect(catalog, conns, wanted as ProviderId[]));

    test('suit l’ordre du service, pas celui du catalogue', () => {
      expect(recommend([], ['notion', 'github', 'linear'])).toEqual(['notion', 'github', 'linear']);
    });

    test('mon outil n’y est pas', () => {
      expect(recommend([conn('github', { isCreator: true })], ['github', 'linear'])).toEqual([
        'linear',
      ]);
    });

    test('le GitHub d’un collègue présent n’y est pas', () => {
      expect(recommend([conn('github')], ['github', 'linear'])).toEqual(['linear']);
    });

    test('le Gmail d’un collègue y reste (texte privé)', () => {
      expect(recommend([conn('gmail')], ['gmail', 'linear'])).toEqual(['gmail', 'linear']);
    });

    test('le GitHub d’un ancien membre y reste', () => {
      expect(recommend([conn('github', { creatorLeft: true })], ['github'])).toEqual(['github']);
    });

    test('un outil indisponible n’y est pas', () => {
      expect(recommend([], ['slack', 'jira'])).toEqual(['jira']);
    });
  });
});
