import { describe, expect, test } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import {
  blockHeading,
  cardOf,
  connectedTools,
  matchTool,
  recommendedToConnect,
  scopeOf,
  toolState,
  troubleOf,
} from './model';
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
  test('toolState : une panne l’emporte, la pause veut tous les comptes', () => {
    expect(
      toolState([
        { status: 'active', creatorLeft: false },
        { status: 'error', creatorLeft: false },
      ]),
    ).toBe('error');
    expect(
      toolState([
        { status: 'paused', creatorLeft: false },
        { status: 'active', creatorLeft: false },
      ]),
    ).toBe('ok');
    expect(toolState([{ status: 'paused', creatorLeft: false }])).toBe('paused');
  });

  test('blockHeading : qui a branché, sinon le compte quand la même personne a branché deux fois', () => {
    const a = { label: 'julie@a.example', createdBy: { id: 'u1', name: 'Julie' } };
    const b = { label: 'julie@b.example', createdBy: { id: 'u1', name: 'Julie' } };
    const c = { label: 'ana@a.example', createdBy: { id: 'u2', name: 'Ana' } };
    expect([a, b, c].map((x) => blockHeading(x, [a, b, c]))).toEqual([
      'julie@a.example',
      'julie@b.example',
      'Ana',
    ]);
  });

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

    test('mon outil en erreur n’y est pas non plus (il se reconnecte, il ne se rebranche pas)', () => {
      expect(
        recommend([conn('github', { isCreator: true, status: 'error' })], ['github', 'linear']),
      ).toEqual(['linear']);
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

  describe('la carte d’un outil branché', () => {
    const DUE = new Date('2026-11-12T10:00:00Z');
    const c = (over: Partial<ConnectionView> = {}) =>
      ({
        provider: 'linear',
        status: 'active',
        creatorLeft: false,
        nextSyncAt: DUE,
        isCreator: false,
        createdBy: { id: 'u2', name: 'Inès' },
        partage: null,
        ...over,
      }) as ConnectionView;

    test('troubleOf : arrêtée, déconnectée (la relève ne repart pas seule), en échec (elle réessaie), rien', () => {
      expect(troubleOf(c({ creatorLeft: true, status: 'error' }))).toBe('stopped');
      expect(troubleOf(c({ status: 'error', nextSyncAt: null }))).toBe('disconnected');
      expect(troubleOf(c({ status: 'error' }))).toBe('syncError');
      expect(troubleOf(c({ status: 'paused', nextSyncAt: null }))).toBeNull();
      expect(troubleOf(c())).toBeNull();
    });

    test('un problème d’abord : celui que la personne peut réparer, avec « Reconnecter »', () => {
      const theirs = c({ status: 'error', nextSyncAt: null });
      const mine = c({ status: 'error', isCreator: true, createdBy: { id: 'me', name: 'Julie' } });
      const card = cardOf([c(), theirs, mine], 'me');
      expect(card).toMatchObject({ conn: mine, caption: 'syncError', reconnect: true });
      expect(cardOf([c(), theirs], 'me')).toMatchObject({
        caption: 'disconnected',
        reconnect: false,
      });
    });

    test('arrêtée : personne ne la reconnecte, même son ancien créateur', () => {
      expect(cardOf([c({ creatorLeft: true, isCreator: true })], 'me')).toMatchObject({
        caption: 'stopped',
        reconnect: false,
      });
    });

    test('en pause seulement si toutes le sont ; sinon qui voit, sur la connexion de la personne', () => {
      expect(cardOf([c({ status: 'paused' })], 'me')?.caption).toBe('paused');
      const mine = c({ createdBy: { id: 'me', name: 'Julie' } });
      expect(cardOf([c({ status: 'paused' }), mine], 'me')).toMatchObject({
        conn: mine,
        caption: 'scope',
      });
      expect(cardOf([], 'me')).toBeNull();
    });

    test('scopeOf : son choix, sinon celui de l’outil ; GitHub toujours l’équipe', () => {
      expect(scopeOf(c(), false)).toBe('equipe');
      expect(scopeOf(c(), true)).toBe('moi');
      expect(scopeOf(c({ partage: 'g-1' }), true)).toBe('g-1');
      expect(scopeOf(c({ provider: 'github', partage: 'moi' }), false)).toBe('equipe');
    });
  });

  test('matchTool : une famille, des lettres sans accents dans le nom ou la famille', () => {
    const gmail = { label: 'Gmail', family: 'mails' } as const;
    expect(matchTool(gmail, null, '', 'Mails, chat et agenda')).toBe(true);
    expect(matchTool(gmail, 'dev', '', 'Mails, chat et agenda')).toBe(false);
    expect(matchTool(gmail, null, ' GMA ', 'Mails')).toBe(true);
    expect(matchTool(gmail, null, 'agénda', 'Mails, chat et agenda')).toBe(true);
    expect(matchTool(gmail, 'mails', 'slack', 'Mails')).toBe(false);
  });
});
