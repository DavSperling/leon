import { describe, expect, it } from 'vitest';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorItem } from '@/server/connectors/types';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { granolaCatalog } from './catalog';
import { granolaConnector } from './connector';
import listPage1 from './fixtures/list-notes-page-1.json';
import listPage2 from './fixtures/list-notes-page-2.json';
import note1d3 from './fixtures/note-1d3.json';
import note2k8 from './fixtures/note-2k8.json';
import note3m7 from './fixtures/note-3m7.json';
import note4n6 from './fixtures/note-4n6.json';
import transcriptPage1 from './fixtures/transcript-page-1.json';
import transcriptPage2 from './fixtures/transcript-page-2.json';

const API = 'https://public-api.granola.ai';
const CONFIG = { apiKey: 'grn_test_0123456789' };
const SINCE = new Date('2026-09-15T00:00:00Z');

const noteRoute = (
  note: { id: string; [key: string]: unknown },
  extra: Partial<FakeRoute> = {},
): FakeRoute => ({
  url: `${API}/v1/notes/${note.id}`,
  json: note,
  ...extra,
});

// Les quatre notes des fixtures, dans l'ordre où le connecteur doit les lire (la plus ancienne
// d'abord), alors que la liste de la fixture les donne de la plus récente à la plus ancienne.
const ALL_NOTE_ROUTES = () => [
  noteRoute(note4n6),
  noteRoute(note3m7),
  noteRoute(note2k8),
  noteRoute(note1d3),
];
const LIST_ROUTES = (): FakeRoute[] => [
  { url: `${API}/v1/notes`, json: listPage1 },
  { url: `${API}/v1/notes`, json: listPage2 },
];

async function syncAll(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(granolaConnector, CONFIG, routes);
  const pages = await collect(granolaConnector.sync(CONFIG, { cursor, since: SINCE }, http));
  return { pages, calls, items: pages.flatMap((page) => page.items) };
}

function itemFor(items: ConnectorItem[], externalId: string): ConnectorItem {
  const item = items.find((candidate) => candidate.externalId === externalId);
  if (!item) throw new Error(`élément absent : ${externalId}`);
  return item;
}

describe('configuration', () => {
  it('exige une clé non vide, sans espaces autour', () => {
    const schema = granolaConnector.configSchema;

    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
    expect(schema.parse({ apiKey: '  grn_abc\n' })).toEqual({ apiKey: 'grn_abc' });
  });

  it('déclare la clé comme secret, un hôte exact et 5 requêtes par seconde au plus', () => {
    expect(granolaConnector.secretFields).toEqual(['apiKey']);
    expect(granolaConnector.hosts(CONFIG)).toEqual(['public-api.granola.ai']);
    expect(granolaConnector.minIntervalMs).toBe(200);
  });

  it('a un catalogue dont le champ secret est la clé', () => {
    expect(granolaCatalog.fields).toEqual([
      expect.objectContaining({ name: 'apiKey', kind: 'secret' }),
    ]);
    expect(granolaCatalog.warning).toMatch(/Business/);
  });
});

describe('verify', () => {
  it('lit une note avec la clé en Bearer et rend un compte lisible', async () => {
    const { http, calls } = testHttp(granolaConnector, CONFIG, [
      { url: `${API}/v1/notes`, json: { ...listPage1, notes: listPage1.notes.slice(0, 1) } },
    ]);

    const { account } = await granolaConnector.verify(CONFIG, http);

    expect(account).toMatch(/Granola/);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.pathname).toBe('/v1/notes');
    expect(url.searchParams.get('page_size')).toBe('1');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${CONFIG.apiKey}`);
  });

  it('dit qu’aucune note n’est lisible quand la liste est vide', async () => {
    const { http } = testHttp(granolaConnector, CONFIG, [
      { url: `${API}/v1/notes`, json: { notes: [], hasMore: false, cursor: null } },
    ]);

    const { account } = await granolaConnector.verify(CONFIG, http);

    expect(account).toMatch(/no readable notes/);
  });

  it('lève ConnectorAuthError quand la clé est refusée', async () => {
    const { http } = testHttp(granolaConnector, CONFIG, [
      { url: `${API}/v1/notes`, status: 401, json: { error: 'unauthorized' } },
    ]);

    await expect(granolaConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('filtre sur since, lit toutes les pages de la liste, avec la clé', async () => {
    const { calls } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);

    const [firstList, secondList] = calls.map((call) => new URL(call.url));
    expect(firstList?.searchParams.get('updated_after')).toBe(SINCE.toISOString());
    expect(firstList?.searchParams.get('page_size')).toBe('30');
    expect(firstList?.searchParams.has('cursor')).toBe(false);
    expect(secondList?.searchParams.get('cursor')).toBe(listPage1.cursor);
    expect(calls.every((call) => call.headers.authorization === `Bearer ${CONFIG.apiKey}`)).toBe(
      true,
    );
  });

  it('rend les notes de la plus ancienne à la plus récente, sans la note supprimée', async () => {
    const { pages, calls } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      'meeting:not_4n6Yh2DfJg8UkG',
      'meeting:not_3m7Xv9BcHd4SeF',
      'meeting:not_2k8Qw3ZnLp5RtA',
      'meeting:not_1d3tmYTlCICgjy',
    ]);
    expect(calls.some((call) => call.url.includes('not_5p5Zj3EgKh9VlH'))).toBe(false);
  });

  it('demande la transcription avec la note', async () => {
    const { calls } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);

    const noteCalls = calls.filter((call) => /\/v1\/notes\/not_/.test(call.url));
    expect(noteCalls).toHaveLength(4);
    for (const call of noteCalls) {
      expect(new URL(call.url).searchParams.get('include')).toBe('transcript');
    }
  });

  it('range le curseur sur la dernière note rendue', async () => {
    const { pages } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);

    expect(JSON.parse(pages[0]?.cursor ?? '')).toEqual({
      updatedAt: '2026-10-14T16:45:00.000Z',
      ids: ['not_1d3tmYTlCICgjy'],
    });
  });
});

describe('sync : une réunion', () => {
  async function meeting(id: string): Promise<ConnectorItem> {
    const { items } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);
    return itemFor(items, `meeting:${id}`);
  }

  it('porte le titre, le lien, la date, les participants et la nature', async () => {
    const item = await meeting('not_1d3tmYTlCICgjy');

    expect(item).toMatchObject({
      nature: 'reunion',
      title: 'Point budget trimestriel',
      url: 'https://notes.granola.ai/d/f3e45e0f-24cc-480b-9a6c-8b1f5e3d7a2c',
      updatedAt: '2026-10-14T16:45:00Z',
      origin: { participants: 'Marie Durand, Paul Martin, Léa Bernard' },
    });
  });

  it('range une prise de parole par locuteur, datée de son début, dans l’ordre', async () => {
    const item = await meeting('not_1d3tmYTlCICgjy');

    expect(item.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'On commence par le budget du trimestre.\nPaul, tu as les chiffres ?',
        ts: '2026-10-14T15:30:05Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: 'Oui : nous avons dépensé 40 000 euros, il reste 12 000 euros.',
        ts: '2026-10-14T15:30:14Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'Autres participants', email: null },
        text: "Je m'occupe de la relance des fournisseurs d'ici vendredi.",
        ts: '2026-10-14T15:31:02Z',
      },
      {
        externalId: 'utterance:4',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Parfait, on garde le budget actuel.',
        ts: '2026-10-14T15:31:20Z',
      },
    ]);
  });

  it('donne le nom de l’unique autre participant à « eux »', async () => {
    const item = await meeting('not_2k8Qw3ZnLp5RtA');

    expect(item.turns.map((turn) => turn.author)).toEqual([
      { name: 'Sophie Lambert', email: 'sophie@fournisseur.test' },
      { name: 'Marie Durand', email: 'marie@acme.test' },
    ]);
  });

  it('garde l’étiquette des locuteurs anonymes du téléphone, sans inventer un nom', async () => {
    const item = await meeting('not_3m7Xv9BcHd4SeF');

    expect(item.turns.map((turn) => turn.author)).toEqual([
      { name: 'Speaker A', email: null },
      { name: 'Speaker B', email: null },
      { name: null, email: null },
    ]);
    expect(item.origin).toEqual({});
  });

  it('sans transcription, rend le résumé en un tour document daté de la mise à jour', async () => {
    const item = await meeting('not_4n6Yh2DfJg8UkG');

    expect(item.title).toBe('Revue du planning');
    expect(item.turns).toEqual([
      {
        externalId: 'summary',
        role: 'document',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: "## Revue du planning\n\n- Le planning est décalé d'une semaine",
        ts: '2026-10-11T14:00:00Z',
      },
    ]);
  });

  it('passe la normalisation sans être refusée (dates ISO avec fuseau)', async () => {
    const { items } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()]);

    expect(items).toHaveLength(4);
    for (const item of items) expect(normalizeItem(item, 'granola')).not.toBeNull();
  });

  it('ne rend pas une note sans transcription ni résumé', async () => {
    const empty = { ...note4n6, summary_text: '', summary_markdown: null };

    const { items } = await syncAll([
      {
        url: `${API}/v1/notes`,
        json: { notes: [listPage2.notes[1]], hasMore: false, cursor: null },
      },
      noteRoute(empty),
    ]);

    expect(items).toEqual([]);
  });
});

describe('sync : cas limites', () => {
  it('saute une note devenue introuvable et rend les autres', async () => {
    const { items } = await syncAll([
      ...LIST_ROUTES(),
      noteRoute(note4n6, { status: 404, json: { error: 'not found' } }),
      noteRoute(note3m7),
      noteRoute(note2k8),
      noteRoute(note1d3),
    ]);

    expect(items.map((item) => item.externalId)).toEqual([
      'meeting:not_3m7Xv9BcHd4SeF',
      'meeting:not_2k8Qw3ZnLp5RtA',
      'meeting:not_1d3tmYTlCICgjy',
    ]);
  });

  it('lève ConnectorAuthError quand la clé est refusée sur la liste', async () => {
    await expect(
      syncAll([{ url: `${API}/v1/notes`, status: 401, json: {} }]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError quand la clé est refusée sur une note', async () => {
    await expect(
      syncAll([...LIST_ROUTES(), noteRoute(note4n6, { status: 401, json: {} })]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lit la transcription page par page quand elle est trop grande pour la note', async () => {
    const listed = { notes: [listPage1.notes[1]], hasMore: false, cursor: null };
    const withoutTranscript = { ...note2k8, transcript: null };

    const { items, calls } = await syncAll([
      { url: `${API}/v1/notes`, json: listed },
      noteRoute(note2k8, { status: 413, json: { error: 'TRANSCRIPT_TOO_LARGE' } }),
      noteRoute(withoutTranscript),
      { url: `${API}/v1/notes/${note2k8.id}/transcript`, json: transcriptPage1 },
      { url: `${API}/v1/notes/${note2k8.id}/transcript`, json: transcriptPage2 },
    ]);

    const [, withInclude, withoutInclude, firstTranscript, secondTranscript] = calls.map(
      (call) => new URL(call.url),
    );
    expect(withInclude?.searchParams.get('include')).toBe('transcript');
    expect(withoutInclude?.searchParams.has('include')).toBe(false);
    expect(firstTranscript?.searchParams.get('page_size')).toBe('100');
    expect(firstTranscript?.searchParams.has('cursor')).toBe(false);
    expect(secondTranscript?.searchParams.get('cursor')).toBe(transcriptPage1.cursor);
    expect(items[0]?.turns.map((turn) => turn.externalId)).toEqual(['utterance:0', 'utterance:1']);
    expect(items[0]?.turns.map((turn) => turn.author.name)).toEqual([
      'Sophie Lambert',
      'Marie Durand',
    ]);
  });

  it('sort la note avec son résumé quand la transcription paginée est interdite (403)', async () => {
    const listed = { notes: [listPage1.notes[1]], hasMore: false, cursor: null };

    const { items } = await syncAll([
      { url: `${API}/v1/notes`, json: listed },
      noteRoute(note2k8, { status: 413, json: {} }),
      noteRoute({ ...note2k8, transcript: null }),
      { url: `${API}/v1/notes/${note2k8.id}/transcript`, status: 403, json: {} },
    ]);

    expect(items[0]?.turns).toEqual([
      expect.objectContaining({ externalId: 'summary', role: 'document' }),
    ]);
  });

  it('remonte une erreur de la transcription paginée autre que 403', async () => {
    const listed = { notes: [listPage1.notes[1]], hasMore: false, cursor: null };

    await expect(
      syncAll([
        { url: `${API}/v1/notes`, json: listed },
        noteRoute(note2k8, { status: 413, json: {} }),
        noteRoute({ ...note2k8, transcript: null }),
        { url: `${API}/v1/notes/${note2k8.id}/transcript`, status: 400, json: {} },
      ]),
    ).rejects.toBeInstanceOf(ConnectorHttpError);
  });
});

// 25 notes, la 20e et la 21e au même instant : la première page de 20 s'arrête au milieu de deux
// notes de même date.
const TEMPLATE = note2k8;
const manyId = (i: number) => `not_${String(i).padStart(14, '0')}`;
const manyAt = (i: number) => new Date(Date.UTC(2026, 9, 1, 8, i <= 19 ? i : i - 1)).toISOString();
const manyNote = (i: number) => ({ ...TEMPLATE, id: manyId(i), updated_at: manyAt(i) });
const manySummary = (i: number) => ({
  id: manyId(i),
  object: 'note',
  title: `Réunion ${i}`,
  owner: TEMPLATE.owner,
  created_at: manyAt(i),
  updated_at: manyAt(i),
  deleted_at: null,
});
const manyList = (from: number, to: number): FakeRoute => ({
  url: `${API}/v1/notes`,
  json: {
    notes: Array.from({ length: to - from }, (_, k) => manySummary(to - 1 - k)), // récentes d'abord
    hasMore: false,
    cursor: null,
  },
});
const manyRoutes = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, k) => noteRoute(manyNote(from + k)));

describe('sync : beaucoup de notes et reprise', () => {
  it('rend les notes par pages de 20 avec un curseur après chacune', async () => {
    const { pages } = await syncAll([manyList(0, 25), ...manyRoutes(0, 25)]);

    expect(pages.map((page) => page.items.length)).toEqual([20, 5]);
    expect(JSON.parse(pages[0]?.cursor ?? '')).toEqual({
      updatedAt: manyAt(19),
      ids: [manyId(19)],
    });
    expect(JSON.parse(pages[1]?.cursor ?? '')).toEqual({
      updatedAt: manyAt(24),
      ids: [manyId(24)],
    });
  });

  it('reprend juste après le curseur, sans relire la note déjà rendue au même instant', async () => {
    const first = await syncAll([manyList(0, 25), ...manyRoutes(0, 25)]);
    const cursor = first.pages[0]?.cursor ?? null;

    // La liste inclut la note du curseur (le filtre « depuis » peut être inclusif) : la route de
    // sa fiche manque exprès, une requête sur elle ferait échouer le test.
    const { pages, calls } = await syncAll([manyList(19, 25), ...manyRoutes(20, 25)], cursor);

    expect(new URL(calls[0]?.url ?? '').searchParams.get('updated_after')).toBe(manyAt(19));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual(
      [20, 21, 22, 23, 24].map((i) => `meeting:${manyId(i)}`),
    );
  });

  it('ne refait rien avec le dernier curseur rendu', async () => {
    const first = await syncAll([manyList(0, 25), ...manyRoutes(0, 25)]);
    const cursor = first.pages.at(-1)?.cursor ?? null;

    const { pages } = await syncAll([manyList(24, 25)], cursor);

    expect(pages).toEqual([]);
  });

  it('ignore un curseur illisible et repart de since', async () => {
    const { pages, calls } = await syncAll([...LIST_ROUTES(), ...ALL_NOTE_ROUTES()], 'pas du json');

    expect(new URL(calls[0]?.url ?? '').searchParams.get('updated_after')).toBe(
      SINCE.toISOString(),
    );
    expect(pages[0]?.items).toHaveLength(4);
  });
});
