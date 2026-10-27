import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { listCatalog } from '@/server/connectors/catalog';
import { normalizeItem } from '@/server/connectors/normalize';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import type { AnyConnector, ConnectorItem } from '../types';
import { tldvConnector } from './connector';
import meetingsPage1 from './fixtures/meetings-page-1.json';
import meetingsPage2 from './fixtures/meetings-page-2.json';
import notFound from './fixtures/not-found.json';
import notes200 from './fixtures/notes-meeting-200.json';
import transcript100 from './fixtures/transcript-meeting-100.json';
import transcript300 from './fixtures/transcript-meeting-300.json';

const API_KEY = `test-${randomUUID()}`;
const CONFIG = { apiKey: API_KEY };
const SINCE = new Date('2026-09-15T00:00:00Z');
const BASE = 'https://pasta.tldv.io/v1alpha1';
const LIST = `${BASE}/meetings`;
const transcriptUrl = (id: string) => `${BASE}/meetings/${id}/transcript`;
const notesUrl = (id: string) => `${BASE}/meetings/${id}/notes`;
const listPage = (page: number): RegExp => new RegExp(`/meetings\\?.*\\bpage=${page}(&|$)`);

function run(
  routes: FakeRoute[],
  state: { cursor: string | null; since?: Date } = { cursor: null },
) {
  const { http, calls } = testHttp(tldvConnector, CONFIG, routes);
  const pages = collect(
    tldvConnector.sync(CONFIG, { cursor: state.cursor, since: state.since ?? SINCE }, http),
  );
  return { pages, calls };
}

// Les trois réunions des fixtures, dans l'ordre où l'outil les rend (sans doute les plus récentes
// d'abord : la doc ne dit rien, le connecteur ne s'y fie pas).
const fixtureRoutes = (): FakeRoute[] => [
  { url: listPage(1), json: meetingsPage1 },
  { url: listPage(2), json: meetingsPage2 },
  { url: transcriptUrl('meeting-100'), json: transcript100 },
  { url: transcriptUrl('meeting-200'), status: 404, json: notFound },
  { url: notesUrl('meeting-200'), json: notes200 },
  { url: transcriptUrl('meeting-300'), json: transcript300 },
];

// Des réunions fabriquées : une par heure à partir du 1er octobre 2026, la liste du plus récent au
// plus ancien, chacune avec une seule prise de parole.
function manyMeetings(count: number): FakeRoute[] {
  const meetings = Array.from({ length: count }, (_, i) => ({
    id: `m-${String(i).padStart(2, '0')}`,
    name: `Réunion ${i}`,
    happenedAt: new Date(Date.UTC(2026, 9, 1) + i * 3_600_000).toISOString(),
    url: null,
    organizer: { name: 'Marie Durand', email: 'marie@acme.test' },
    invitees: [],
  }));
  const transcripts = meetings.map((m) => ({
    url: transcriptUrl(m.id),
    json: {
      id: `t-${m.id}`,
      meetingId: m.id,
      data: [{ speaker: 'Marie Durand', text: m.name, startTime: 0 }],
    },
  }));
  const list = { page: 1, pages: 1, total: count, pageSize: 100, results: meetings.reverse() };
  return [{ url: listPage(1), json: list }, ...transcripts];
}

function itemsOf(pages: Array<{ items: ConnectorItem[] }>): ConnectorItem[] {
  return pages.flatMap((page) => page.items);
}

describe('tldvConnector : configuration', () => {
  it('refuse une configuration incomplète ou une clé vide', () => {
    const { configSchema } = tldvConnector;
    expect(configSchema.safeParse({}).success).toBe(false);
    expect(configSchema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(configSchema.safeParse({ apiKey: '  \n' }).success).toBe(false);
    expect(configSchema.parse({ apiKey: ` ${API_KEY}\n` })).toEqual({ apiKey: API_KEY });
  });

  it('chiffre la clé, et ne parle qu’à l’hôte de l’API', () => {
    expect(tldvConnector.secretFields).toEqual(['apiKey']);
    expect(tldvConnector.hosts({ apiKey: API_KEY })).toEqual(['pasta.tldv.io']);
  });

  it('est disponible dans le catalogue, avec son avertissement', () => {
    const entry = listCatalog('fr').find((item) => item.id === 'tldv');
    expect(entry).toMatchObject({ available: true, triedForReal: false });
    expect(entry?.warning).toContain('Pro');
  });

  it('déclare au catalogue les champs de la configuration, la clé en secret', () => {
    const entry = listCatalog('fr').find((item) => item.id === 'tldv');
    const connector: AnyConnector = tldvConnector;
    const keys = Object.keys((connector.configSchema as z.ZodObject).shape);
    expect(entry?.fields.map((field) => field.name)).toEqual(keys);
    const secrets = entry?.fields.filter((field) => field.kind === 'secret');
    expect(secrets?.map((field) => field.name)).toEqual([...tldvConnector.secretFields]);
    expect(entry?.keyHelp).not.toBe('');
    expect(entry?.docsUrl).toMatch(/^https:\/\//);
  });
});

describe('tldvConnector : verify', () => {
  it('lit la liste avec la clé dans x-api-key et rend un compte lisible', async () => {
    const { http, calls } = testHttp(tldvConnector, CONFIG, [{ url: LIST, json: meetingsPage1 }]);

    const { account } = await tldvConnector.verify(CONFIG, http);

    expect(account).toBe('3 accessible meetings');
    const url = new URL(calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(LIST);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(calls[0]?.headers['x-api-key']).toBe(API_KEY);
  });

  it('lève ConnectorAuthError quand la clé est refusée', async () => {
    const { http } = testHttp(tldvConnector, CONFIG, [{ url: LIST, status: 401, json: {} }]);

    await expect(tldvConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('tldvConnector : sync', () => {
  it('demande la liste depuis since (un jour de marge), page par page', async () => {
    const { pages, calls } = run(fixtureRoutes());
    await pages;

    const first = new URL(calls[0]?.url ?? '').searchParams;
    expect(first.get('from')).toBe('2026-09-14');
    expect(first.get('limit')).toBe('100');
    expect(first.get('page')).toBe('1');
    expect(first.get('onlyParticipated')).toBe('true');
    expect(new URL(calls[1]?.url ?? '').searchParams.get('page')).toBe('2');
    expect(calls[0]?.headers['x-api-key']).toBe(API_KEY);
  });

  it('rend les réunions de la plus ancienne à la plus récente, avec locuteurs et dates', async () => {
    const items = itemsOf(await run(fixtureRoutes()).pages);

    expect(items.map((item) => item.externalId)).toEqual([
      'meeting:meeting-100',
      'meeting:meeting-200',
      'meeting:meeting-300',
    ]);
    const [sprint, , product] = items;
    expect(sprint).toMatchObject({
      nature: 'reunion',
      title: 'Revue de sprint',
      url: 'https://tldv.io/app/meetings/meeting-100',
      updatedAt: '2026-10-01T08:00:00.000Z',
      origin: { participants: 'Marie Durand, Paul Martin, Sophie Bernard' },
    });
    // Deux prises de parole de Marie se suivent : un seul tour, daté de la première.
    expect(sprint?.turns).toEqual([
      {
        externalId: 'speech:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour à tous, on commence la revue de sprint.\nLe point principal : la migration de la base est terminée.',
        ts: '2026-10-01T08:00:00.000Z',
      },
      {
        externalId: 'speech:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: "Je m'occupe de la documentation d'ici vendredi.",
        ts: '2026-10-01T08:00:15.200Z',
      },
      {
        externalId: 'speech:3',
        role: 'participant',
        author: { name: 'Speaker 3', email: null },
        text: 'Très bien, merci.',
        ts: '2026-10-01T08:00:21.000Z',
      },
    ]);
    // Le début de la parole s'ajoute au début de la réunion (en secondes).
    expect(product?.turns[0]?.ts).toBe('2026-10-12T14:01:02.000Z');
  });

  it('remplace une transcription absente par le résumé, daté de la réunion', async () => {
    const items = itemsOf(await run(fixtureRoutes()).pages);

    const workshop = items.find((item) => item.externalId === 'meeting:meeting-200');
    // Date donnée avec un décalage (+02:00) : lue comme l'instant qu'elle désigne.
    expect(workshop?.updatedAt).toBe('2026-10-08T09:30:00.000Z');
    expect(workshop?.turns).toEqual([
      {
        externalId: 'notes',
        role: 'document',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: notes200.markdownContent,
        ts: '2026-10-08T09:30:00.000Z',
      },
    ]);
  });

  it('rend des éléments que la normalisation accepte', async () => {
    const items = itemsOf(await run(fixtureRoutes()).pages);

    expect(items).toHaveLength(3);
    for (const item of items) expect(normalizeItem(item, 'tldv')).not.toBeNull();
  });

  it('ne rend pas une réunion sans transcription ni résumé, mais garde son curseur', async () => {
    const empty = { page: 1, pages: 1, total: 1, results: [{ ...meetingsPage2.results[0] }] };
    const { pages } = run([
      { url: listPage(1), json: empty },
      { url: transcriptUrl('meeting-100'), json: { id: 't', meetingId: 'meeting-100', data: [] } },
      { url: notesUrl('meeting-100'), json: { markdownContent: '  ' } },
    ]);

    const result = await pages;

    expect(itemsOf(result)).toEqual([]);
    expect(JSON.parse(result[0]?.cursor ?? 'null')).toMatchObject({ id: 'meeting-100' });
  });

  it('range en deux passes de 20 réunions plus le reste, et reprend au curseur', async () => {
    const first = await run(manyMeetings(45)).pages;

    expect(first.map((page) => page.items.length)).toEqual([20, 20, 5]);
    const ids = itemsOf(first).map((item) => item.externalId);
    expect(ids).toEqual(
      Array.from({ length: 45 }, (_, i) => `meeting:m-${String(i).padStart(2, '0')}`),
    );

    // Repris au curseur de la première page : les 20 premières ne reviennent pas.
    const resume = run(manyMeetings(45), { cursor: first[0]?.cursor ?? null });
    const rest = await resume.pages;
    expect(itemsOf(rest).map((item) => item.externalId)).toEqual(ids.slice(20));
    expect(resume.calls.some((call) => call.url.includes('/m-19/'))).toBe(false);
  });

  it('ne refait rien depuis le dernier curseur', async () => {
    const all = await run(manyMeetings(45)).pages;

    const after = run(manyMeetings(45), { cursor: all.at(-1)?.cursor ?? null });

    expect(await after.pages).toEqual([]);
    expect(after.calls.every((call) => !call.url.includes('/transcript'))).toBe(true);
  });

  it('ignore les réunions plus anciennes que since', async () => {
    const { pages, calls } = run(manyMeetings(10), {
      cursor: null,
      since: new Date(Date.UTC(2026, 9, 1, 5)),
    });

    expect(itemsOf(await pages).map((item) => item.externalId)).toEqual([
      'meeting:m-05',
      'meeting:m-06',
      'meeting:m-07',
      'meeting:m-08',
      'meeting:m-09',
    ]);
    expect(calls.some((call) => call.url.includes('/m-04/'))).toBe(false);
  });
});

describe('tldvConnector : ressources secondaires', () => {
  const NOW = Date.now();
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  const meeting = (id: string, happenedAt: string) => ({
    id,
    name: id,
    happenedAt,
    organizer: { name: 'Marie Durand', email: 'marie@acme.test' },
  });
  const listOf = (...results: Array<ReturnType<typeof meeting>>): FakeRoute => ({
    url: listPage(1),
    json: { page: 1, pages: 1, total: results.length, results },
  });
  const since = new Date(NOW - 30 * 86_400_000);
  const speech = (id: string) => ({
    url: transcriptUrl(id),
    json: {
      id: `t-${id}`,
      meetingId: id,
      data: [{ speaker: 'Marie Durand', text: 'Bonjour', startTime: 1 }],
    },
  });

  it('attend la transcription d’une réunion récente au lieu de la sauter', async () => {
    const { pages, calls } = run(
      [
        listOf(
          meeting('old', ago(3 * 24 * 60)),
          meeting('fresh', ago(30)),
          meeting('later', ago(5)),
        ),
        speech('old'),
        { url: transcriptUrl('fresh'), status: 404, json: notFound },
      ],
      { cursor: null, since },
    );

    const result = await pages;

    expect(itemsOf(result).map((item) => item.externalId)).toEqual(['meeting:old']);
    expect(JSON.parse(result[0]?.cursor ?? 'null')).toMatchObject({ id: 'old' });
    // Ni son résumé, ni la réunion suivante : on revient la chercher au prochain passage.
    expect(calls.map((call) => call.url)).not.toContain(notesUrl('fresh'));
    expect(calls.some((call) => call.url.includes('/later/'))).toBe(false);
  });

  it('prend le résumé d’une vieille réunion sans transcription, et passe à la suivante', async () => {
    const { pages } = run(
      [
        listOf(meeting('stale', ago(8 * 60)), meeting('next', ago(7 * 60))),
        { url: transcriptUrl('stale'), status: 404, json: notFound },
        { url: notesUrl('stale'), json: { markdownContent: 'Résumé : budget validé.' } },
        speech('next'),
      ],
      { cursor: null, since },
    );

    const items = itemsOf(await pages);

    expect(items.map((item) => item.externalId)).toEqual(['meeting:stale', 'meeting:next']);
    expect(items[0]?.turns.map((turn) => turn.role)).toEqual(['document']);
  });

  it('sort sans tours si l’offre de l’organisateur refuse l’accès (403)', async () => {
    const { pages } = run(
      [
        listOf(meeting('a', ago(2 * 24 * 60)), meeting('b', ago(60))),
        { url: transcriptUrl('a'), status: 403, json: {} },
        { url: notesUrl('a'), json: { markdownContent: 'Résumé de a.' } },
        { url: transcriptUrl('b'), status: 403, json: {} },
        { url: notesUrl('b'), status: 403, json: {} },
      ],
      { cursor: null, since },
    );

    const result = await pages;

    // Un 403 définitif ne bloque pas la suite, même pour une réunion récente.
    expect(itemsOf(result).map((item) => item.externalId)).toEqual(['meeting:a']);
    expect(JSON.parse(result[0]?.cursor ?? 'null')).toMatchObject({ id: 'b' });
  });

  it('remonte un 401 sur une transcription : la clé n’est plus bonne', async () => {
    const { pages } = run(
      [listOf(meeting('a', ago(2 * 24 * 60))), { url: transcriptUrl('a'), status: 401, json: {} }],
      { cursor: null, since },
    );

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 sur la liste', async () => {
    const { pages } = run([{ url: listPage(1), status: 401, json: {} }]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une liste dont une date n’a pas de fuseau', async () => {
    const bad = {
      page: 1,
      pages: 1,
      total: 1,
      results: [{ id: 'x', happenedAt: '2026-10-08 09:30:00' }],
    };
    const { pages } = run([{ url: listPage(1), json: bad }]);

    await expect(pages).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      message: 'Unexpected response',
    });
  });
});
