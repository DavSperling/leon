import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractText } from '@/server/documents/documents';
import { collect, type FakeRoute, fakeFetch, testHttp } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import { normalizeItem } from '../normalize';
import { outlookOAuth } from '../outlook/oauth';
import { onedriveConnector } from './connector';
import { onedriveOAuth } from './oauth';

// L'extraction (officeparser) est celle de l'import manuel, testée là-bas : simulée ici.
vi.mock('@/server/documents/documents', () => ({ extractText: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));

// Un jeton généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `eyJ.${randomBytes(12).toString('hex')}`;
const config = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: 'jeton-de-rafraichissement',
  expiresAt: null,
  sharepointHost: 'contoso.sharepoint.com',
} as const;
const SINCE = new Date('2026-10-01T00:00:00.000Z');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SITE = 'contoso.sharepoint.com,1111,2222';
const MINE = 'b!perso';
const TEAM = 'b!equipe';
const delta = (drive: string) => `${GRAPH}/drives/${drive}/root/delta`;
const item = (drive: string, id: string) => `${GRAPH}/drives/${drive}/items/${id}`;
const MY_DOWNLOAD =
  'https://contoso-my.sharepoint.com/personal/david/_layouts/15/download.aspx?UniqueId=1';
const TEAM_DOWNLOAD =
  'https://contoso.sharepoint.com/sites/chantiers/_layouts/15/download.aspx?UniqueId=2';

const DEVIS = {
  id: 'F1',
  name: 'Devis Lebrun.docx',
  file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  size: 20_000,
  webUrl: 'https://contoso-my.sharepoint.com/personal/david/Documents/Devis%20Lebrun.docx',
  lastModifiedDateTime: '2026-10-20T09:30:00Z',
  lastModifiedBy: { user: { displayName: 'David', email: 'david@contoso.test' } },
};
const PLANNING = {
  id: 'F2',
  name: 'Planning.xlsx',
  file: {},
  size: 8_000,
  webUrl: 'https://contoso.sharepoint.com/sites/chantiers/Documents/Planning.xlsx',
  lastModifiedDateTime: '2026-10-21T08:00:00Z',
  lastModifiedBy: { user: { displayName: 'Amos', email: 'amos@contoso.test' } },
};

// La liste des bibliothèques : le OneDrive, puis un site avec une bibliothèque et une liste qui n'en est pas une.
const listing = (): FakeRoute[] => [
  { url: `${GRAPH}/me/drive`, json: { id: MINE } },
  { url: `${GRAPH}/sites`, json: { value: [{ id: SITE, displayName: 'Chantiers' }] } },
  {
    url: `${GRAPH}/sites/${SITE}/drives`,
    json: {
      value: [
        { id: TEAM, driveType: 'documentLibrary' },
        { id: 'b!autre', driveType: 'business' },
      ],
    },
  },
];
const download = (drive: string, id: string, url: string, bytes = 'contenu'): FakeRoute[] => [
  { url: item(drive, id), json: { id, '@microsoft.graph.downloadUrl': url } },
  { url, bytes: new TextEncoder().encode(bytes) },
];
const deltaLink = (drive: string, token: string) => `${delta(drive)}?token=${token}`;
const quietDelta = (drive: string, token: string): FakeRoute => ({
  url: delta(drive),
  json: { value: [], '@odata.deltaLink': deltaLink(drive, token) },
});

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(onedriveConnector, config, routes);
  const pages = await collect(onedriveConnector.sync(config, { cursor, since: SINCE }, http));
  const state = JSON.parse(pages.at(-1)?.cursor ?? 'null');
  return { pages, calls, state };
}

beforeEach(() => {
  vi.mocked(extractText).mockReset();
  vi.mocked(extractText).mockResolvedValue({ text: 'Texte du fichier', partial: false });
});

describe('onedriveConnector : configuration', () => {
  const accepts = (value: unknown) => onedriveConnector.configSchema.safeParse(value).success;

  it('n’accepte que le bouton, avec l’hôte SharePoint lu au branchement', () => {
    expect(accepts(config)).toBe(true);
    expect(accepts({ ...config, authMode: 'key' })).toBe(false);
    expect(accepts({ ...config, sharepointHost: undefined })).toBe(false);
    expect(accepts({ ...config, sharepointHost: 'evil.example.com' })).toBe(false);
    expect(accepts({ ...config, sharepointHost: 'contoso.sharepoint.com.evil.test' })).toBe(false);
  });

  it('n’appelle que Graph et les deux hôtes SharePoint du locataire, sans jeton dans secretFields', () => {
    expect(onedriveConnector.hosts(config)).toEqual([
      'graph.microsoft.com',
      'contoso.sharepoint.com',
      'contoso-my.sharepoint.com',
    ]);
    expect(onedriveConnector.secretFields).toEqual([]);
    expect(onedriveConnector.privateRaw).toBe(true);
  });
});

describe('onedriveOAuth', () => {
  it('reprend le déroulé Microsoft d’Outlook avec sa propre appli, en lecture seule', () => {
    expect(onedriveOAuth.appKey).toBe('ONEDRIVE');
    expect(onedriveOAuth.authorizeUrl).toBe(outlookOAuth.authorizeUrl);
    expect(onedriveOAuth.tokenUrl).toBe(outlookOAuth.tokenUrl);
    expect(onedriveOAuth.pkce).toBe(true);
    expect(onedriveOAuth.scopes).toEqual([
      'offline_access',
      'User.Read',
      'Files.Read',
      'Sites.Read.All',
    ]);
    expect(onedriveOAuth.scopes.some((scope) => /write/i.test(scope))).toBe(false);
    expect(onedriveOAuth.extraTokenParams?.refresh?.scope).toBe(onedriveOAuth.scopes.join(' '));
    expect(onedriveOAuth.setupHosts).toEqual(['graph.microsoft.com']);
    const consent = new URL(
      onedriveOAuth.adminConsent?.url('appli-1', 'https://leon.test/retour') ?? '',
    );
    expect(consent.searchParams.get('client_id')).toBe('appli-1');
    expect(consent.searchParams.get('scope')).toBe('https://graph.microsoft.com/.default');
  });

  const toConfig = (hostname: string) => {
    const fetchImpl = fakeFetch([
      { url: `${GRAPH}/sites/root`, json: { siteCollection: { hostname } } },
    ]);
    const http = createConnectorHttp({
      provider: 'onedrive',
      hosts: onedriveOAuth.setupHosts,
      fetchImpl,
    });
    const tokens = {
      accessToken: ACCESS,
      refreshToken: null,
      expiresAt: null,
      scope: null,
      raw: {},
    };
    return { result: onedriveOAuth.toConfig(tokens, {}, http), calls: fetchImpl.calls };
  };

  it('lit l’hôte SharePoint du locataire au branchement, avec le jeton reçu', async () => {
    const { result, calls } = toConfig('Contoso.SharePoint.com');
    expect(await result).toEqual({ sharepointHost: 'contoso.sharepoint.com' });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });

  it('refuse un hôte qui n’est pas de SharePoint : il entrerait dans la liste des hôtes permis', async () => {
    await expect(toConfig('evil.example.com').result).rejects.toThrow('Unexpected response');
  });
});

describe('onedriveConnector : verify', () => {
  it('nomme le compte Microsoft', async () => {
    const { http } = testHttp(onedriveConnector, config, [
      {
        url: `${GRAPH}/me`,
        json: { id: 'u-1', displayName: 'David', mail: 'david@contoso.test' },
      },
    ]);
    expect(await onedriveConnector.verify(config, http)).toEqual({
      account: 'David (david@contoso.test)',
      accountKey: 'u-1',
    });
  });
});

describe('onedriveConnector : synchronisation', () => {
  it('lit le OneDrive puis les bibliothèques des sites, depuis `since`, en pages de 25', async () => {
    const { pages, calls, state } = await runSync([
      ...listing(),
      {
        url: delta(MINE),
        json: { value: [DEVIS], '@odata.deltaLink': deltaLink(MINE, 'm1') },
      },
      ...download(MINE, 'F1', MY_DOWNLOAD),
      {
        url: delta(TEAM),
        json: { value: [PLANNING], '@odata.deltaLink': deltaLink(TEAM, 't1') },
      },
      ...download(TEAM, 'F2', TEAM_DOWNLOAD),
    ]);

    const sites = new URL(calls[1]?.url ?? '');
    expect(sites.searchParams.get('search')).toBe('*');
    const first = new URL(calls.find((call) => call.url.startsWith(delta(MINE)))?.url ?? '');
    expect(first.searchParams.get('token')).toBe('2026-10-01T00:00:00Z');
    expect(first.searchParams.get('$top')).toBe('25');
    for (const call of calls.filter((c) => c.url.startsWith(GRAPH)))
      expect(call.headers.authorization).toBe(`Bearer ${ACCESS}`);

    expect(pages.flatMap((page) => page.items)).toEqual([
      {
        externalId: `file:${MINE}:F1`,
        nature: 'page',
        title: 'Devis Lebrun.docx',
        url: DEVIS.webUrl,
        updatedAt: '2026-10-20T09:30:00.000Z',
        origin: {},
        turns: [
          {
            externalId: 'body',
            role: 'document',
            author: { name: 'David', email: 'david@contoso.test' },
            text: 'Texte du fichier',
            ts: '2026-10-20T09:30:00.000Z',
          },
        ],
      },
      expect.objectContaining({ externalId: `file:${TEAM}:F2`, origin: { site: 'Chantiers' } }),
    ]);
    expect(vi.mocked(extractText).mock.calls.map(([extension]) => extension)).toEqual([
      'docx',
      'xlsx',
    ]);
    for (const item of pages.flatMap((page) => page.items))
      expect(normalizeItem(item, 'onedrive')).not.toBeNull();

    expect(state.libraries).toEqual([
      { id: MINE, site: null, link: deltaLink(MINE, 'm1') },
      { id: TEAM, site: 'Chantiers', link: deltaLink(TEAM, 't1') },
    ]);
  });

  it('télécharge par l’adresse signée, sans le jeton', async () => {
    const { calls } = await runSync([
      ...listing(),
      { url: delta(MINE), json: { value: [DEVIS], '@odata.deltaLink': deltaLink(MINE, 'm1') } },
      ...download(MINE, 'F1', MY_DOWNLOAD),
      quietDelta(TEAM, 't1'),
    ]);
    const asked = calls.find((call) => call.url.startsWith(item(MINE, 'F1')));
    expect(new URL(asked?.url ?? '').searchParams.get('$select')).toBe(
      'id,@microsoft.graph.downloadUrl',
    );
    const fetched = calls.find((call) => call.url === MY_DOWNLOAD);
    expect(fetched?.headers.authorization).toBeUndefined();
  });

  it('retire un fichier supprimé, et laisse de côté dossiers, images, gros fichiers et adresses étrangères', async () => {
    const { pages, calls } = await runSync([
      ...listing(),
      {
        url: delta(MINE),
        json: {
          value: [
            { id: 'root', name: 'root', folder: {}, root: {} },
            { id: 'D1', deleted: {} },
            {
              id: 'P1',
              name: 'photo.jpg',
              file: {},
              size: 10,
              lastModifiedDateTime: '2026-10-20T00:00:00Z',
            },
            { ...DEVIS, id: 'BIG', size: 11 * 1024 * 1024 },
            { ...DEVIS, id: 'FAR' },
          ],
          '@odata.deltaLink': deltaLink(MINE, 'm1'),
        },
      },
      {
        url: item(MINE, 'FAR'),
        json: {
          id: 'FAR',
          '@microsoft.graph.downloadUrl': 'https://contosoeur-my.sharepoint.com/x',
        },
      },
      quietDelta(TEAM, 't1'),
    ]);

    expect(pages[0]?.items).toEqual([]);
    expect(pages[0]?.removed).toEqual([`file:${MINE}:D1`]);
    expect(calls.some((call) => call.url.includes('/items/BIG'))).toBe(false);
    expect(calls.some((call) => call.url.includes('contosoeur'))).toBe(false);
    expect(extractText).not.toHaveBeenCalled();
  });

  it('laisse de côté un fichier fermé ou supprimé au moment du téléchargement', async () => {
    const { pages } = await runSync([
      ...listing(),
      {
        url: delta(MINE),
        json: { value: [DEVIS, { ...DEVIS, id: 'F9' }], '@odata.deltaLink': deltaLink(MINE, 'm1') },
      },
      { url: item(MINE, 'F1'), status: 404, json: { error: { code: 'itemNotFound' } } },
      { url: item(MINE, 'F9'), json: { id: 'F9', '@microsoft.graph.downloadUrl': MY_DOWNLOAD } },
      { url: MY_DOWNLOAD, status: 403, text: '' },
      quietDelta(TEAM, 't1'),
    ]);
    expect(pages.flatMap((page) => page.items)).toEqual([]);
  });

  it('suit @odata.nextLink, et garde la page suivante dans le curseur après chaque page', async () => {
    const next = `${delta(MINE)}?token=page2`;
    const { pages } = await runSync([
      ...listing(),
      { url: delta(MINE), json: { value: [], '@odata.nextLink': next } },
      { url: next, json: { value: [], '@odata.deltaLink': deltaLink(MINE, 'm2') } },
      quietDelta(TEAM, 't1'),
    ]);
    expect(JSON.parse(pages[0]?.cursor ?? '').libraries[0].link).toBe(next);
    expect(JSON.parse(pages[1]?.cursor ?? '').libraries[0].link).toBe(deltaLink(MINE, 'm2'));
  });

  it('reprend au lien delta du curseur, sans relire la liste du jour', async () => {
    const cursor = JSON.stringify({
      listedAt: new Date().toISOString(),
      libraries: [
        { id: MINE, site: null, link: deltaLink(MINE, 'm1') },
        { id: TEAM, site: 'Chantiers', link: deltaLink(TEAM, 't1') },
      ],
    });
    const { calls } = await runSync(
      [
        {
          url: deltaLink(MINE, 'm1'),
          json: { value: [], '@odata.deltaLink': deltaLink(MINE, 'm2') },
        },
        {
          url: deltaLink(TEAM, 't1'),
          json: { value: [], '@odata.deltaLink': deltaLink(TEAM, 't2') },
        },
      ],
      cursor,
    );
    expect(calls.map((call) => call.url)).toEqual([deltaLink(MINE, 'm1'), deltaLink(TEAM, 't1')]);
  });

  it('relit la liste après un jour, en gardant les liens des bibliothèques connues', async () => {
    const cursor = JSON.stringify({
      listedAt: '2026-01-01T00:00:00.000Z',
      libraries: [{ id: MINE, site: null, link: deltaLink(MINE, 'm1') }],
    });
    const { calls, state } = await runSync(
      [...listing(), quietDelta(MINE, 'm2'), quietDelta(TEAM, 't1')],
      cursor,
    );
    expect(calls.find((call) => call.url.startsWith(delta(MINE)))?.url).toBe(deltaLink(MINE, 'm1'));
    expect(state.libraries.map((library: { id: string }) => library.id)).toEqual([MINE, TEAM]);
  });

  it('relit depuis `since` sur un 410 : le lien delta est trop vieux', async () => {
    const cursor = JSON.stringify({
      listedAt: new Date().toISOString(),
      libraries: [{ id: MINE, site: null, link: deltaLink(MINE, 'vieux') }],
    });
    const { calls, state } = await runSync(
      [
        { url: deltaLink(MINE, 'vieux'), status: 410, json: { error: { code: 'resyncRequired' } } },
        quietDelta(MINE, 'neuf'),
      ],
      cursor,
    );
    expect(new URL(calls[1]?.url ?? '').searchParams.get('token')).toBe('2026-10-01T00:00:00Z');
    expect(state.libraries[0].link).toBe(deltaLink(MINE, 'neuf'));
  });

  it('ne relit pas en boucle : un second 410 fait échouer le passage', async () => {
    const cursor = JSON.stringify({
      listedAt: new Date().toISOString(),
      libraries: [{ id: MINE, site: null, link: deltaLink(MINE, 'vieux') }],
    });
    const { http } = testHttp(onedriveConnector, config, [
      { url: deltaLink(MINE, 'vieux'), status: 410, json: {} },
      { url: delta(MINE), status: 410, json: {} },
    ]);
    await expect(
      collect(onedriveConnector.sync(config, { cursor, since: SINCE }, http)),
    ).rejects.toThrow('responded with 410');
  });

  it('laisse de côté une bibliothèque d’équipe fermée ou supprimée, pas le OneDrive', async () => {
    const { pages } = await runSync([
      ...listing(),
      quietDelta(MINE, 'm1'),
      { url: delta(TEAM), status: 404, json: { error: { code: 'itemNotFound' } } },
    ]);
    expect(pages).toHaveLength(1);

    const { http } = testHttp(onedriveConnector, config, [
      ...listing(),
      { url: delta(MINE), status: 404, json: {} },
    ]);
    await expect(
      collect(onedriveConnector.sync(config, { cursor: null, since: SINCE }, http)),
    ).rejects.toThrow('responded with 404');
  });

  it('lit les sites seuls quand la personne n’a pas de OneDrive, et saute un site fermé', async () => {
    const { state } = await runSync([
      { url: `${GRAPH}/me/drive`, status: 404, json: { error: { code: 'itemNotFound' } } },
      {
        url: `${GRAPH}/sites`,
        json: {
          value: [
            { id: 'ferme', name: 'ferme' },
            { id: SITE, name: 'chantiers' },
          ],
        },
      },
      { url: `${GRAPH}/sites/ferme/drives`, status: 403, json: {} },
      {
        url: `${GRAPH}/sites/${SITE}/drives`,
        json: { value: [{ id: TEAM, driveType: 'documentLibrary' }] },
      },
      quietDelta(TEAM, 't1'),
    ]);
    expect(state.libraries).toEqual([{ id: TEAM, site: 'chantiers', link: deltaLink(TEAM, 't1') }]);
  });

  it('repart de zéro sur un curseur illisible', async () => {
    const { calls } = await runSync(
      [...listing(), quietDelta(MINE, 'm1'), quietDelta(TEAM, 't1')],
      '{pas du json',
    );
    expect(calls[0]?.url).toBe(`${GRAPH}/me/drive?%24select=id`);
  });
});
