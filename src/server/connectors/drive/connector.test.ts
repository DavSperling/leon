import { describe, expect, it, vi } from 'vitest';
import { extractText } from '@/server/documents/documents';
import { logError } from '@/server/log';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { normalizeItem } from '../normalize';
import { driveConnector } from './connector';

// L'extraction (officeparser) est celle de l'import manuel, testée là-bas : simulée ici.
vi.mock('@/server/documents/documents', () => ({ extractText: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));

const config = {
  authMode: 'pipedream',
  externalUserId: 'leon-u1',
  accountId: 'apn_abc123',
} as const;
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SINCE = new Date('2026-10-01T00:00:00Z');

const DOC = {
  id: 'doc1',
  name: 'Compte rendu chantier',
  mimeType: 'application/vnd.google-apps.document',
  modifiedTime: '2026-10-20T09:30:00.123Z',
  webViewLink: 'https://docs.google.com/document/d/doc1/edit',
  lastModifyingUser: { displayName: 'David', emailAddress: 'david@acme.test', me: true },
};
const NOTE = {
  id: 'txt1',
  name: 'notes.md',
  mimeType: 'text/markdown',
  modifiedTime: '2026-10-21T08:00:00.000Z',
  lastModifyingUser: { displayName: 'Amos', emailAddress: 'amos@acme.test' },
};
const SHEET = {
  id: 'sheet1',
  name: 'Budget',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  modifiedTime: '2026-10-22T08:00:00.000Z',
};

const files = (list: unknown[], nextPageToken?: string): FakeRoute => ({
  url: `${DRIVE}/files`,
  json: { files: list, ...(nextPageToken ? { nextPageToken } : {}) },
});

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(driveConnector, config, routes);
  const pages = await collect(driveConnector.sync(config, { cursor, since: SINCE }, http));
  return { pages, calls };
}

describe('driveConnector', () => {
  it('passe par Pipedream, vers l’API Drive seulement', () => {
    expect(driveConnector.hosts(config)).toEqual(['www.googleapis.com']);
    expect(driveConnector.pipedream).toEqual({ app: 'google_drive' });
    expect(driveConnector.secretFields).toEqual([]);
  });

  it('vérifie par le compte Drive', async () => {
    const { http } = testHttp(driveConnector, config, [
      {
        url: `${DRIVE}/about`,
        json: {
          user: { displayName: 'David', emailAddress: 'david@acme.test', permissionId: '0123' },
        },
      },
    ]);
    expect(await driveConnector.verify(config, http)).toEqual({
      account: 'David (david@acme.test)',
      accountKey: '0123',
    });
  });

  it('cherche les fichiers lisibles modifiés depuis `since`, du plus ancien au plus récent', async () => {
    const { calls } = await runSync([files([])]);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('q')).toBe(
      "modifiedTime >= '2026-10-01T00:00:00' and trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation')",
    );
    expect(url.searchParams.get('orderBy')).toBe('modifiedTime');
    expect(url.searchParams.get('corpora')).toBe('allDrives');
    expect(url.searchParams.get('supportsAllDrives')).toBe('true');
  });

  it('exporte les fichiers Google en texte, télécharge le texte, une page par fichier', async () => {
    const { pages, calls } = await runSync([
      files([DOC, NOTE, SHEET]),
      { url: `${DRIVE}/files/doc1/export`, text: 'Dalle coulée.\r\nReste : carrelage.' },
      { url: `${DRIVE}/files/txt1`, text: '# Notes\n' },
      { url: `${DRIVE}/files/sheet1/export`, text: 'poste,montant\nplomberie,1200' },
    ]);

    expect(new URL(calls[1]?.url ?? '').searchParams.get('mimeType')).toBe('text/plain');
    expect(new URL(calls[2]?.url ?? '').searchParams.get('alt')).toBe('media');
    expect(new URL(calls[3]?.url ?? '').searchParams.get('mimeType')).toBe('text/csv');
    expect(pages).toHaveLength(3);
    const doc = pages[0]?.items[0];
    expect(doc).toMatchObject({
      externalId: 'file:doc1',
      nature: 'page',
      title: 'Compte rendu chantier',
      url: DOC.webViewLink,
      updatedAt: '2026-10-20T09:30:00.123Z',
    });
    expect(doc?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'David', email: 'david@acme.test' },
        side: 'team',
        text: 'Dalle coulée.\nReste : carrelage.',
        ts: '2026-10-20T09:30:00.123Z',
      },
    ]);
    expect(pages[1]?.items[0]?.turns[0]?.side).toBeUndefined();
    for (const page of pages)
      for (const item of page.items) expect(normalizeItem(item, 'drive')).not.toBeNull();
    expect(JSON.parse(pages[2]?.cursor ?? '')).toEqual({
      mark: { at: '2026-10-22T08:00:00.000Z', seen: ['sheet1'] },
    });
  });

  it('télécharge un PDF ou un fichier Office et en extrait le texte ; un fichier illisible est laissé', async () => {
    const PDF = { ...NOTE, id: 'pdf1', name: 'devis.pdf', mimeType: 'application/pdf' };
    const WORD = {
      ...NOTE,
      id: 'docx1',
      name: 'contrat.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    vi.mocked(extractText)
      .mockResolvedValueOnce({ text: 'Devis : 1 200 € HT.', partial: false })
      .mockRejectedValueOnce(Object.assign(new Error('protégé'), { officeIssue: { code: 'X' } }));

    const { pages, calls } = await runSync([
      files([PDF, WORD]),
      { url: `${DRIVE}/files/pdf1`, bytes: pdfBytes },
      { url: `${DRIVE}/files/docx1`, bytes: new Uint8Array([0x50, 0x4b]) },
    ]);

    expect(new URL(calls[1]?.url ?? '').searchParams.get('alt')).toBe('media');
    expect(vi.mocked(extractText).mock.calls.map(([type, bytes]) => [type, [...bytes]])).toEqual([
      ['pdf', [...pdfBytes]],
      ['docx', [0x50, 0x4b]],
    ]);
    expect(pages.map((page) => page.items.length)).toEqual([1, 0]);
    expect(pages[0]?.items[0]?.turns[0]?.text).toBe('Devis : 1 200 € HT.');
    expect(JSON.parse(pages[1]?.cursor ?? '').mark.seen).toEqual(['pdf1', 'docx1']);
    expect(logError).toHaveBeenCalledWith('connector.drive_unreadable', expect.any(Error), {
      reason: 'X',
    });
  });

  it('laisse un fichier trop gros ou protégé, mais pas une limite de débit', async () => {
    const tooBig = { error: { errors: [{ reason: 'exportSizeLimitExceeded' }] } };
    const { pages } = await runSync([
      files([DOC, NOTE]),
      { url: `${DRIVE}/files/doc1/export`, status: 403, json: tooBig },
      { url: `${DRIVE}/files/txt1`, status: 404 },
    ]);
    expect(pages.map((page) => page.items.length)).toEqual([0, 0]);
    expect(JSON.parse(pages[1]?.cursor ?? '').mark.seen).toEqual(['txt1']);

    const limited = { error: { errors: [{ reason: 'rateLimitExceeded' }] } };
    const run = runSync([
      files([DOC]),
      { url: `${DRIVE}/files/doc1/export`, status: 403, json: limited },
    ]);
    await expect(run).rejects.toMatchObject({ status: 429 });
  });

  it('laisse un fichier de plus de 10 Mo', async () => {
    const big = { 'content-length': String(11 * 1024 * 1024) };
    const { pages } = await runSync([
      files([NOTE]),
      { url: `${DRIVE}/files/txt1`, text: 'x', headers: big },
    ]);
    expect(pages.map((page) => page.items.length)).toEqual([0]);
  });

  it('reprend après le curseur sans relire le fichier déjà lu', async () => {
    const cursor = JSON.stringify({ mark: { at: DOC.modifiedTime, seen: ['doc1'] } });
    const { pages, calls } = await runSync(
      [files([DOC, NOTE]), { url: `${DRIVE}/files/txt1`, text: 'suite' }],
      cursor,
    );
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toContain(
      "modifiedTime >= '2026-10-20T09:30:00'",
    );
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/drive/v3/files',
      '/drive/v3/files/txt1',
    ]);
    expect(pages).toHaveLength(1);
  });

  it('suit les pages de la liste', async () => {
    const { calls } = await runSync([files([], 'p2'), files([])]);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('pageToken')).toBe('p2');
  });
});
