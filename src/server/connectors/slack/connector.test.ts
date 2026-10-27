import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import { channelDays, slackConnector } from './connector';

const config = {
  authMode: 'pipedream',
  externalUserId: 'leon-u1',
  accountId: 'apn_abc123',
} as const;
const SEARCH = 'https://slack.com/api/search.messages';
const SINCE = new Date('2026-10-20T00:00:00Z');

const ts = (iso: string, micro = '000100') => `${Date.parse(iso) / 1000}.${micro}`;
const match = (
  channel: { id: string; name?: string; is_im?: boolean; is_mpim?: boolean },
  at: string,
  text: string,
  username = 'julie',
) => ({
  ts: ts(at),
  text,
  user: 'U1',
  username,
  permalink: `https://acme.slack.com/archives/${channel.id}/p1`,
  channel,
});
const GENERAL = { id: 'C1', name: 'général', is_im: false, is_mpim: false };
const DM = { id: 'D1', name: 'U2', is_im: true, is_mpim: false };
// Sans is_im ni is_mpim, rien ne dit que ce n'est pas un message privé : il est écarté.
const UNKNOWN = { id: 'C2', name: 'inconnu' };

const searchRoute = (matches: unknown[], pages = 1): FakeRoute => ({
  url: SEARCH,
  json: {
    ok: true,
    messages: { matches, paging: { count: 100, total: matches.length, page: 1, pages } },
  },
});

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(slackConnector, config, routes);
  const pages = await collect(slackConnector.sync(config, { cursor, since: SINCE }, http));
  return { pages, calls };
}

describe('slackConnector', () => {
  it('passe par Pipedream, vers slack.com seulement', () => {
    expect(slackConnector.hosts(config)).toEqual(['slack.com']);
    expect(slackConnector.pipedream).toEqual({ app: 'slack_v2' });
    expect(slackConnector.privateRaw).toBe(true);
  });

  it('vérifie par auth.test : l’utilisateur et son espace', async () => {
    const { http } = testHttp(slackConnector, config, [
      {
        url: 'https://slack.com/api/auth.test',
        json: { ok: true, team: 'Acme', user: 'david', team_id: 'T1', user_id: 'U9' },
      },
    ]);
    expect(await slackConnector.verify(config, http)).toEqual({
      account: 'david (Acme)',
      accountKey: 'T1:U9',
    });
  });

  it('traduit une réponse ok: false : accès retiré, ou erreur à nous', async () => {
    const revoked = testHttp(slackConnector, config, [
      { url: 'https://slack.com/api/auth.test', json: { ok: false, error: 'token_revoked' } },
    ]);
    await expect(slackConnector.verify(config, revoked.http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );

    const odd = testHttp(slackConnector, config, [
      { url: 'https://slack.com/api/auth.test', json: { ok: false, error: '<script>' } },
    ]);
    await expect(slackConnector.verify(config, odd.http)).rejects.toThrow(
      'Slack responded with erreur',
    );
  });

  it('cherche depuis deux jours avant `since`, du plus ancien au plus récent', async () => {
    const { calls } = await runSync([searchRoute([])]);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('query')).toBe('after:2026-10-18');
    expect(url.searchParams.get('sort')).toBe('timestamp');
    expect(url.searchParams.get('sort_dir')).toBe('asc');
    expect(url.searchParams.get('count')).toBe('100');
  });

  it('regroupe par canal et par jour, sans messages directs ni messages d’avant `since`', async () => {
    const { pages } = await runSync([
      searchRoute([
        match(GENERAL, '2026-10-19T09:00:00Z', 'trop vieux'),
        match(GENERAL, '2026-10-21T09:00:00Z', 'On coule la dalle &amp; on attend'),
        match(DM, '2026-10-21T10:00:00Z', 'privé'),
        match(UNKNOWN, '2026-10-21T10:30:00Z', 'peut-être privé'),
        match(GENERAL, '2026-10-21T11:00:00Z', 'ok', 'amos'),
        match(GENERAL, '2026-10-22T08:00:00Z', 'Carrelage livré'),
      ]),
    ]);

    const items = pages[0]?.items ?? [];
    expect(items.map((item) => [item.externalId, item.title])).toEqual([
      ['channel:C1:2026-10-21', '#général, 21/10/2026'],
      ['channel:C1:2026-10-22', '#général, 22/10/2026'],
    ]);
    expect(items[0]?.turns.map((turn) => [turn.author.name, turn.text])).toEqual([
      ['julie', 'On coule la dalle & on attend'],
      ['amos', 'ok'],
    ]);
    for (const item of items) expect(normalizeItem(item, 'slack')).not.toBeNull();
    // Le message direct est vu (la position avance), jamais rendu.
    expect(JSON.parse(pages[0]?.cursor ?? '').mark.at).toBe('2026-10-22T08:00:00.000Z');
  });

  it('reprend après la position sans rendre deux fois un message, et suit les pages', async () => {
    const first = match(GENERAL, '2026-10-21T09:00:00Z', 'déjà lu');
    const cursor = JSON.stringify({
      mark: { at: '2026-10-21T09:00:00.000Z', seen: [`C1:${first.ts}`] },
    });
    const { pages, calls } = await runSync(
      [
        searchRoute([first, match(GENERAL, '2026-10-21T09:30:00Z', 'nouveau')], 2),
        searchRoute([match(GENERAL, '2026-10-21T10:00:00Z', 'encore')], 2),
      ],
      cursor,
    );

    expect(new URL(calls[0]?.url ?? '').searchParams.get('query')).toBe('after:2026-10-19');
    expect(new URL(calls[1]?.url ?? '').searchParams.get('page')).toBe('2');
    expect(
      pages.flatMap((page) => page.items.flatMap((item) => item.turns.map((t) => t.text))),
    ).toEqual(['nouveau', 'encore']);
  });

  it('nomme un canal inconnu sans inventer de nom', () => {
    const [item] = channelDays([match({ id: 'C9' }, '2026-10-21T09:00:00Z', 'texte')]);
    expect(item?.title).toBe('Canal Slack, 21/10/2026');
    expect(item?.origin).toEqual({});
  });
});
