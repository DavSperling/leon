import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import en from '../../../../messages/en.json';
import { Catalogue } from './catalogue';

// Le bureau de Connexions rendu côté serveur : une carte par outil branché (un nom, une légende), une tuile par outil
// libre, une seule pastille d'encre, et rien qui compte, date ou décrit sur un rectangle.
const h = createElement as unknown as (type: unknown, props?: object | null) => ReactElement;
const html = (node: ReactNode) =>
  renderToStaticMarkup(h(NextIntlClientProvider, { locale: 'en', messages: en, children: node }));

const tool = (id: string, family: string, over: Partial<CatalogItem> = {}) =>
  ({
    id,
    label: id[0]?.toUpperCase() + id.slice(1),
    family,
    available: true,
    privateRaw: false,
    oauthReady: true,
    keyAccepted: true,
    ...over,
  }) as CatalogItem;
const CATALOG = [
  tool('github', 'dev'),
  tool('linear', 'dev'),
  tool('intercom', 'support', { oauthReady: false }),
  tool('gmail', 'mails', { privateRaw: true }),
  tool('slack', 'mails', { privateRaw: true }),
  tool('jira', 'projet', { available: false }),
];
const conn = (provider: string, over: Partial<ConnectionView> = {}) =>
  ({
    id: `${provider}-1`,
    provider,
    label: 'acme',
    config: { authMode: 'key' },
    status: 'active',
    nextSyncAt: new Date(),
    lastSyncAt: new Date(),
    itemsSynced: 1842,
    createdBy: { id: 'me', name: 'Julie' },
    isCreator: true,
    canManage: true,
    creatorLeft: false,
    partage: null,
    ...over,
  }) as unknown as ConnectionView;

const render = (conns: ConnectionView[], canConnect = true, recommended: string[] = []) =>
  html(
    h(Catalogue, {
      catalog: CATALOG,
      recommended,
      conns,
      viewerId: 'me',
      canConnect,
      groups: [],
      onOpen: () => {},
    }),
  );

describe('Connexions : le bureau', () => {
  const conns = [
    conn('gmail'),
    conn('intercom', { status: 'error', nextSyncAt: null, lastError: 'Intercom rejected the key' }),
    conn('linear', { status: 'error', nextSyncAt: null }),
    conn('github', { creatorLeft: true, isCreator: false, createdBy: { id: 'x', name: 'Ana' } }),
  ];
  const out = render(conns);
  const cards = out.match(/<button[^>]*class="tl card[^"]*"[\s\S]*?<\/button>/g) ?? [];

  it('une carte par outil branché, les problèmes d’abord ; une tuile par outil libre ; « Bientôt » n’est pas un bouton', () => {
    expect(cards).toHaveLength(4);
    // en panne d'abord (dans l'ordre du catalogue), puis le reste
    expect(cards.map((c) => /aria-label="(\w+ \w+)"/.exec(c)?.[1])).toEqual([
      'Manage Github',
      'Reconnect Linear',
      'Reconnect Intercom',
      'Manage Gmail',
    ]);
    expect(out.match(/<button[^>]*class="tl tile[ "]/g)).toHaveLength(1);
    expect(out).toContain('aria-label="Connect Slack"');
    expect(out).toMatch(/<div class="tl tile[^"]*"[\s\S]*Jira[\s\S]*Coming soon/);
  });

  it('une seule pastille d’encre : la première carte que la personne peut reconnecter', () => {
    expect(out.match(/tl__pill--ink/g)).toHaveLength(1);
    expect(cards[1]).toContain('tl__pill--ink');
    expect(cards[2]).toContain('>Reconnect</span>');
    expect(cards[2]).not.toContain('tl__pill--ink');
  });

  it('la légende dit qui voit, ou ce qui ne va pas ; jamais un compte, une date ni la raison', () => {
    expect(cards.find((c) => c.includes('Gmail'))).toContain(
      '<span class="tl__sub">Only you</span>',
    );
    expect(cards.find((c) => c.includes('Github'))).toContain('Stopped');
    expect(cards.find((c) => c.includes('Github'))).toContain('is-err');
    const words = cards.join('').replace(/<[^>]*>/g, ' ');
    expect(words).not.toMatch(/\d|rejected|ago|items/i);
  });

  it('sans clé de chiffrement sur le serveur, aucune carte ne propose de reconnecter', () => {
    expect(render(conns, false)).not.toContain('tl__pill--ink');
  });

  it('les conseillés ouvrent « Ajouter un outil », légendés, sans section à eux', () => {
    const out = render([conn('gmail')], true, ['slack']);
    const tiles = out.match(/<button[^>]*class="tl tile[^"]*"[\s\S]*?<\/button>/g) ?? [];
    expect(tiles[0]).toContain('aria-label="Connect Slack"');
    expect(tiles[0]).toContain('<span class="tl__sub">Recommended</span>');
    expect(tiles.slice(1).join('')).not.toContain('Recommended');
    expect(out.match(/<section/g)).toHaveLength(2);
  });

  it('sans outil branché : des places libres à la taille des cartes, la première porte la pastille d’encre', () => {
    const out = render([], true, ['slack']);
    expect(out).toContain('No tool connected yet');
    const slots =
      out.match(/<button[^>]*class="tl card[^"]*cx-slot[^"]*"[\s\S]*?<\/button>/g) ?? [];
    // les conseillés d'abord ; « Bientôt » (Jira) n'a pas de place
    expect(slots.map((c) => /aria-label="(\w+ \w+)"/.exec(c)?.[1])).toEqual([
      'Connect Slack',
      'Connect Github',
      'Connect Linear',
      'Connect Intercom',
    ]);
    expect(out.match(/tl__pill--ink/g)).toHaveLength(1);
    expect(slots[0]).toContain('tl__pill--ink');
    // une place n'est pas répétée en tuile dessous
    expect(out.match(/aria-label="Connect Slack"/g)).toHaveLength(1);
    expect(out).toContain('aria-label="Connect Gmail"');
    expect(render([], false)).not.toContain('tl__pill--ink');
  });

  it('l’état se dessine : un point sur une carte saine, un anneau et un logo éteint en pause, rien de plus en panne', () => {
    const out = render([
      conn('gmail'),
      conn('slack', { status: 'paused' }),
      conn('linear', { status: 'error' }),
    ]);
    const card = (name: string) =>
      (out.match(/<button[^>]*class="tl card[^"]*"[\s\S]*?<\/button>/g) ?? []).find((c) =>
        c.includes(name),
      ) ?? '';
    expect(card('Gmail')).toContain('cx-dot');
    expect(card('Gmail')).not.toContain('is-paused');
    expect(card('Slack')).toMatch(/class="tl card[^"]*is-paused/);
    expect(card('Slack')).toContain('<span class="tl__sub">Paused</span>');
    expect(card('Linear')).not.toContain('cx-dot');
    expect(card('Linear')).toContain('tl__dot');
  });

  it('une connexion toute neuve, pas encore relevée, dit « Reading… » ; passé dix minutes, elle dit qui voit', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    const at = (minutes: number) =>
      html(
        h(Catalogue, {
          catalog: CATALOG,
          recommended: [],
          conns: [
            conn('gmail', {
              lastSyncAt: null,
              createdAt: new Date(now.getTime() - minutes * 60_000),
            }),
          ],
          viewerId: 'me',
          canConnect: true,
          groups: [],
          now,
          fresh: new Set(['gmail']),
          onOpen: () => {},
        }),
      );
    expect(at(1)).toContain('<span class="mark is-working">Reading…</span>');
    expect(at(1)).toMatch(/class="tl card[^"]*cx-fresh/);
    expect(at(30)).not.toContain('Reading…');
    expect(at(30)).toContain('<span class="tl__sub">Only you</span>');
  });
});
