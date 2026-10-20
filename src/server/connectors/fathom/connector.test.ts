import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorAuthError } from '@/server/connectors/http';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorItem, SyncPage } from '@/server/connectors/types';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { fathomConnector } from './connector';
import page1 from './fixtures/meetings-page-1.json';
import page2 from './fixtures/meetings-page-2.json';

const MEETINGS = 'https://api.fathom.ai/external/v1/meetings';
const CONFIG = { apiKey: 'cle-de-test' };
const SINCE = new Date('2026-09-15T00:00:00Z');
const NOW = new Date('2026-10-15T12:00:00Z');

const list = (json: unknown): FakeRoute => ({ url: MEETINGS, json });
const params = (url: string | undefined) => new URL(url ?? '').searchParams;

async function run(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(fathomConnector, CONFIG, routes);
  const pages = await collect(fathomConnector.sync(CONFIG, { cursor, since: SINCE }, http));
  return { pages, calls };
}

const finalAfter = (pages: SyncPage[]): string => JSON.parse(pages.at(-1)?.cursor ?? '{}').after;
const items = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);

// Une réunion du jeu d'exemple, modifiée.
const meeting = (overrides: Record<string, unknown>) => ({ ...page1.items[0], ...overrides });
const single = (...meetings: unknown[]) => ({ limit: 10, next_cursor: null, items: meetings });

// La date compte : une réunion récente sans texte n'est peut-être pas encore traitée par Fathom.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('configSchema et hôtes', () => {
  it('refuse une config incomplète et accepte une clé', () => {
    const schema = fathomConnector.configSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
    expect(schema.parse({ apiKey: ' abc ' })).toEqual({ apiKey: 'abc' });
  });

  it('ne parle qu’à api.fathom.ai, et la clé est secrète', () => {
    expect(fathomConnector.hosts(CONFIG)).toEqual(['api.fathom.ai']);
    expect(fathomConnector.secretFields).toEqual(['apiKey']);
  });
});

describe('verify', () => {
  it('lit la première page des réunions avec la clé dans X-Api-Key, sans transcription', async () => {
    const { http, calls } = testHttp(fathomConnector, CONFIG, [list(page1)]);

    const { account } = await fathomConnector.verify(CONFIG, http);

    expect(account).toBe('Fathom (clé valide)');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-api-key']).toBe('cle-de-test');
    const query = params(calls[0]?.url);
    expect(new URL(calls[0]?.url ?? '').pathname).toBe('/external/v1/meetings');
    expect(query.has('include_transcript')).toBe(false);
    expect(query.has('include_summary')).toBe(false);
  });

  it('dit quand la clé ne voit aucune réunion', async () => {
    const { http } = testHttp(fathomConnector, CONFIG, [list(single())]);

    const { account } = await fathomConnector.verify(CONFIG, http);

    expect(account).toBe('Fathom (clé valide, mais aucune réunion visible pour le moment)');
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(fathomConnector, CONFIG, [{ url: MEETINGS, status: 401, json: {} }]);

    await expect(fathomConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('demande tout ce qui est créé depuis since, avec transcription et résumé', async () => {
    const { calls } = await run([list(single())]);

    const query = params(calls[0]?.url);
    expect(calls[0]?.headers['x-api-key']).toBe('cle-de-test');
    expect(query.get('created_after')).toBe('2026-09-15T00:00:00.000Z');
    expect(query.get('include_transcript')).toBe('true');
    expect(query.get('include_summary')).toBe('true');
    expect(query.has('cursor')).toBe(false);
  });

  it('rend une réunion : prises de parole regroupées par locuteur, datées depuis le début de l’enregistrement', async () => {
    const { pages } = await run([list(page1), list(page2)]);

    const item = items(pages)[0];
    expect(item).toMatchObject({
      externalId: 'meeting:123456789',
      nature: 'reunion',
      title: 'Point produit Acme',
      url: 'https://fathom.video/calls/123456789',
      updatedAt: '2026-10-12T09:00:00.000Z',
      origin: { participants: 'Marie Durand, Paul Martin' },
    });
    expect(item?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour à tous, on commence par le calendrier.\nLa livraison est repoussée au 3 novembre.',
        ts: '2026-10-12T09:01:05.000Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: null },
        text: "D'accord, je préviens le client demain.",
        ts: '2026-10-12T09:02:02.000Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Merci Paul, on fait le point vendredi.',
        ts: '2026-10-12T09:31:41.000Z',
      },
    ]);
  });

  it('sans transcription, rend le résumé de l’outil en un tour document daté de la réunion', async () => {
    const { pages } = await run([list(page1), list(page2)]);

    const item = items(pages)[1];
    expect(item).toMatchObject({
      externalId: 'meeting:123456790',
      title: 'Appel client Dupont',
      updatedAt: '2026-10-13T14:30:00.000Z',
      origin: { participants: 'Marie Durand, jean@dupont.test' },
    });
    expect(item?.turns).toEqual([
      {
        externalId: 'summary',
        role: 'document',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: '## Résumé\n- Dupont veut une démonstration avant le 20 novembre.',
        ts: '2026-10-13T14:30:00.000Z',
      },
    ]);
  });

  it('prend les locuteurs comme participants quand il n’y a pas d’invités', async () => {
    const { pages } = await run([list(single(meeting({ calendar_invitees: [] })))]);

    expect(items(pages)[0]?.origin).toEqual({ participants: 'Marie Durand, Paul Martin' });
  });

  it('convertit l’horodatage HH:MM:SS depuis un début d’enregistrement avec décalage horaire', async () => {
    const start = '2026-10-12T11:01:00+02:00';
    const talk = { speaker: { display_name: 'Marie' }, text: 'Bonjour.', timestamp: '01:02:03' };
    const { pages } = await run([
      list(single(meeting({ recording_start_time: start, transcript: [talk] }))),
    ]);

    expect(items(pages)[0]?.turns[0]?.ts).toBe('2026-10-12T10:03:03.000Z');
  });

  it('ignore les prises de parole vides', async () => {
    const empty = { speaker: { display_name: 'Marie' }, text: '  ', timestamp: '00:00:01' };
    const talk = { speaker: { display_name: 'Paul' }, text: 'Oui.', timestamp: '00:00:02' };
    const { pages } = await run([
      list(single(meeting({ calendar_invitees: [], transcript: [empty, talk] }))),
    ]);

    expect(items(pages)[0]?.turns.map((turn) => turn.text)).toEqual(['Oui.']);
    expect(items(pages)[0]?.origin).toEqual({ participants: 'Paul' });
  });

  it('ne rend pas une réunion sans transcription ni résumé, ancienne ou non', async () => {
    const blank = { transcript: [], default_summary: { markdown_formatted: '  ' } };
    const old = meeting({ ...blank, recording_id: 1, created_at: '2026-10-01T09:00:00Z' });
    const fresh = meeting({ ...blank, recording_id: 2, created_at: '2026-10-15T10:00:00Z' });

    const { pages } = await run([list(single(old, fresh))]);

    expect(items(pages)).toEqual([]);
  });

  it('passe chaque élément rendu par la normalisation du socle', async () => {
    const { pages } = await run([list(page1), list(page2)]);

    expect(items(pages)).toHaveLength(3);
    for (const item of items(pages)) {
      const normalized = normalizeItem(item, 'fathom');
      expect(normalized?.turns.length, item.externalId).toBeGreaterThan(0);
    }
  });
});

describe('sync : pages et curseur', () => {
  it('suit next_cursor : deux pages, la seconde demandée avec le même created_after', async () => {
    const { pages, calls } = await run([list(page1), list(page2)]);

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.items.length)).toEqual([2, 1]);
    expect(calls).toHaveLength(2);
    expect(params(calls[1]?.url).get('cursor')).toBe('eyJwYWdlIjoyfQ');
    expect(params(calls[1]?.url).get('created_after')).toBe('2026-09-15T00:00:00.000Z');
  });

  it('reprend au milieu du parcours avec le curseur de la première page', async () => {
    const first = await run([list(page1), list(page2)]);

    const { pages, calls } = await run([list(page2)], first.pages[0]?.cursor);

    expect(pages).toHaveLength(1);
    expect(params(calls[0]?.url).get('cursor')).toBe('eyJwYWdlIjoyfQ');
    expect(params(calls[0]?.url).get('created_after')).toBe('2026-09-15T00:00:00.000Z');
  });

  it('le curseur final repart de la réunion la plus récente, sans refaire la première page', async () => {
    const first = await run([list(page1), list(page2)]);
    expect(finalAfter(first.pages)).toBe('2026-10-14T14:00:00.000Z');

    const { calls } = await run([list(single())], first.pages.at(-1)?.cursor);

    const query = params(calls[0]?.url);
    expect(query.get('created_after')).toBe('2026-10-14T14:00:00.000Z');
    expect(query.has('cursor')).toBe(false);
  });

  it('garde le curseur quand rien ne vient : une page vide, le départ ne bouge pas', async () => {
    const { pages } = await run([list(single())]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(finalAfter(pages)).toBe('2026-09-15T00:00:00.000Z');
  });

  it('repart de since si le curseur est illisible', async () => {
    const { calls } = await run([list(single())], 'pas du json');

    expect(params(calls[0]?.url).get('created_after')).toBe('2026-09-15T00:00:00.000Z');
    expect(params(calls[0]?.url).has('cursor')).toBe(false);
  });

  it('suit les réunions dans l’ordre inverse : le départ ne dépasse pas le parcours tant qu’il n’est pas fini', async () => {
    // Fathom ne documente pas l'ordre de la liste : la page la plus récente peut venir d'abord.
    const newest = { limit: 10, next_cursor: 'suite', items: page2.items };
    const oldest = single(page1.items[0]);

    const { pages } = await run([list(newest), list(oldest)]);

    expect(JSON.parse(pages[0]?.cursor ?? '{}')).toMatchObject({
      after: '2026-09-15T00:00:00.000Z',
      next: 'suite',
    });
    expect(finalAfter(pages)).toBe('2026-10-14T14:00:00.000Z');
  });
});

describe('sync : réunion pas encore traitée', () => {
  const pending = meeting({
    recording_id: 99,
    created_at: '2026-10-15T10:00:00Z',
    transcript: null,
    default_summary: null,
  });

  it('retient le départ juste avant une réunion récente sans texte, pour la relire plus tard', async () => {
    const { pages } = await run([list(single(page1.items[0], pending, page2.items[0]))]);

    expect(items(pages).map((item) => item.externalId)).toEqual([
      'meeting:123456789',
      'meeting:123456791',
    ]);
    expect(finalAfter(pages)).toBe('2026-10-15T09:59:59.000Z');
  });

  it('la rend au passage suivant, quand son texte est arrivé', async () => {
    const first = await run([list(single(pending))]);
    const ready = { ...pending, transcript: page2.items[0]?.transcript };

    const { pages, calls } = await run([list(single(ready))], first.pages.at(-1)?.cursor);

    expect(params(calls[0]?.url).get('created_after')).toBe('2026-10-15T09:59:59.000Z');
    expect(items(pages).map((item) => item.externalId)).toEqual(['meeting:99']);
    expect(finalAfter(pages)).toBe('2026-10-15T10:00:00.000Z');
  });

  it('abandonne une réunion restée sans texte plus de six heures', async () => {
    const stale = { ...pending, created_at: '2026-10-15T05:59:00Z' };

    const { pages } = await run([list(single(stale))]);

    expect(items(pages)).toEqual([]);
    expect(finalAfter(pages)).toBe('2026-10-15T05:59:00.000Z');
  });
});
