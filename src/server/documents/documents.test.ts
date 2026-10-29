import { OfficeParser, OfficeWarningType } from 'officeparser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '@/capture/mask-secrets';
import { DOCUMENT_MAX_BYTES } from '@/lib/documents';
import { CONNECTOR_TURN_MAX } from '@/server/connectors/normalize';
import { DocumentError, decodeText, readDocument } from './documents';

// Les formats Office passent par officeparser, simulé ici ; le texte et le code sont lus sans lui.
vi.mock('officeparser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('officeparser')>()),
  OfficeParser: { parseOffice: vi.fn() },
}));

const SECRET = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

// Un arbre d'officeparser réduit à ce que readDocument lit : son texte et ses avertissements.
function parsed(text: string, warnings: string[] = []) {
  return {
    warnings: warnings.map((code) => ({ type: 'warning', code, message: '' })),
    to: async () => ({ value: text, messages: [] }),
  } as never;
}

async function refusal(file: File, name?: string): Promise<string> {
  const error = await readDocument(file, name).catch((caught: unknown) => caught);
  if (!(error instanceof DocumentError)) throw new Error('aucune DocumentError');
  return error.code;
}

beforeEach(() => {
  vi.mocked(OfficeParser.parseOffice).mockReset();
});

describe('readDocument', () => {
  it('lit un fichier texte', async () => {
    const doc = await readDocument(new File(['Devis signé le 3 mars.'], 'devis.txt'));

    expect(doc).toEqual({ title: 'devis.txt', parts: ['Devis signé le 3 mars.'], partial: false });
    expect(OfficeParser.parseOffice).not.toHaveBeenCalled();
  });

  it('lit un fichier de code sans officeparser, avec son chemin de dossier pour titre', async () => {
    const file = new File(['export const a = 1;'], 'a.ts');

    const doc = await readDocument(file, 'projet/src/a.ts');

    expect(doc).toEqual({
      title: 'projet/src/a.ts',
      parts: ['export const a = 1;'],
      partial: false,
    });
    expect(OfficeParser.parseOffice).not.toHaveBeenCalled();
  });

  it('garde la fin d’un titre de chemin trop long', async () => {
    const path = `${'dossier/'.repeat(60)}important.ts`;

    const { title } = await readDocument(new File(['x'], 'important.ts'), path);

    expect(title).toHaveLength(300);
    expect(title.startsWith('…')).toBe(true);
    expect(title.endsWith('/important.ts')).toBe(true);
  });

  it('refuse un fichier de plus de 10 Mo, ou vide', async () => {
    const big = new File([new Uint8Array(DOCUMENT_MAX_BYTES + 1)], 'gros.txt');

    expect(await refusal(big)).toBe('unreadable');
    expect(await refusal(new File([], 'vide.txt'))).toBe('unreadable');
  });

  it('refuse une extension inconnue, ou un ancien format Office', async () => {
    expect(await refusal(new File(['MZ'], 'outil.exe'))).toBe('unreadable');
    expect(await refusal(new File(['x'], 'ancien.doc'))).toBe('unreadable');
    expect(await refusal(new File(['x'], 'sans-extension'))).toBe('unreadable');
    expect(OfficeParser.parseOffice).not.toHaveBeenCalled();
  });

  it('refuse un fichier sans texte lisible', async () => {
    expect(await refusal(new File([' \n\t'], 'blanc.md'))).toBe('empty');
  });

  it('refuse un binaire sous une extension de texte (octet nul au début)', async () => {
    const video = new Uint8Array([0x47, 0x40, 0x00, 0x10, 0x00, 0x00, 0xb0, 0x0d]);

    expect(await refusal(new File([video], 'seg001.ts'))).toBe('unreadable');
  });

  it('refuse une configuration à mot de passe envoyée seule, même hors d’un dossier', async () => {
    const compose = new File(['POSTGRES_PASSWORD: hunter2Xy'], 'docker-compose.yml');

    expect(await refusal(compose)).toBe('ignored');
    expect(await refusal(new File(['x'], 'settings.py'), 'site/settings.py')).toBe('ignored');
  });

  it('refuse plus d’un million de caractères', async () => {
    expect(await refusal(new File(['a'.repeat(1_000_001)], 'long.txt'))).toBe('too_long');
  });

  it('masque les secrets du texte et du titre', async () => {
    const doc = await readDocument(new File([`Clé de prod : ${SECRET}`], `cle ${SECRET}.txt`));

    expect(doc.title).toBe(`cle ${SECRET_MASK}.txt`);
    expect(doc.parts).toEqual([`Clé de prod : ${SECRET_MASK}`]);
  });

  it('découpe un long texte aux titres et aux paragraphes, jamais au milieu d’un mot', async () => {
    const section = (title: string) =>
      `## ${title}\n\n${Array.from({ length: 120 }, (_, i) => `Mot${i} `.repeat(15).trim()).join('\n\n')}`;
    const text = [section('Lot 1'), section('Lot 2'), section('Lot 3')].join('\n\n');

    const { parts } = await readDocument(new File([text], 'chantier.md'));

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(CONNECTOR_TURN_MAX);
      expect(part).toMatch(/^(## Lot \d|Mot\d+ )/);
      expect(part).toMatch(/Mot\d+$/);
    }
    expect(parts.join('\n\n')).toBe(text);
  });

  it('lit un CSV de Windows (Windows-1252) sans perdre ses accents', async () => {
    const bytes = Uint8Array.of(0x50, 0x72, 0x69, 0x78, 0x3b, 0x80, 0x0a, 0x43, 0x61, 0x66, 0xe9);

    const doc = await readDocument(new File([bytes], 'prix.csv'));

    expect(doc.parts).toEqual(['Prix;€\nCafé']);
  });

  it('dit quand officeparser n’a lu le fichier qu’en partie', async () => {
    vi.mocked(OfficeParser.parseOffice).mockResolvedValue(
      parsed('Feuille 1', [OfficeWarningType.TABLE_CELL_LIMIT_EXCEEDED]),
    );

    const doc = await readDocument(new File(['zip'], 'devis.xlsx'));

    expect(doc).toEqual({ title: 'devis.xlsx', parts: ['Feuille 1'], partial: true });
  });

  it('un autre avertissement ne rend pas la lecture partielle', async () => {
    vi.mocked(OfficeParser.parseOffice).mockResolvedValue(
      parsed('Plan du lot 2', [OfficeWarningType.PDF_STRUCT_TREE_UNRELIABLE]),
    );

    expect((await readDocument(new File(['%PDF'], 'plan.pdf'))).partial).toBe(false);
  });

  it('un fichier qu’officeparser ne lit pas est illisible, avec son code pour le journal', async () => {
    const failure = Object.assign(new Error('[OfficeParser]: texte du fichier'), {
      officeIssue: { code: 'FILE_CORRUPTED' },
    });
    vi.mocked(OfficeParser.parseOffice).mockRejectedValue(failure);

    const error = await readDocument(new File(['abc'], 'note.docx')).catch((caught) => caught);

    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({ code: 'unreadable', reason: 'FILE_CORRUPTED' });
    expect(error.message).not.toContain('texte du fichier');
  });

  it('ne lit que deux fichiers Office à la fois', async () => {
    let running = 0;
    let most = 0;
    const releases: Array<() => void> = [];
    vi.mocked(OfficeParser.parseOffice).mockImplementation(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running--;
      return parsed('Texte');
    });

    const reads = Array.from({ length: 4 }, (_, i) =>
      readDocument(new File(['zip'], `doc-${i}.docx`)),
    );
    for (let done = 0; done < 4; done++) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(done));
      releases[done]?.();
    }

    expect((await Promise.all(reads)).every((doc) => doc.parts[0] === 'Texte')).toBe(true);
    expect(most).toBe(2);
  });
});

describe('decodeText', () => {
  it('lit l’UTF-8, sans la marque d’ordre des octets', () => {
    const bytes = new TextEncoder().encode('﻿Été à Noël');

    expect(decodeText(bytes)).toBe('Été à Noël');
  });

  it('lit en Windows-1252 ce qui n’est pas de l’UTF-8', () => {
    expect(decodeText(Uint8Array.of(0xc9, 0x74, 0xe9, 0x20, 0x9c, 0x75, 0x76, 0x72, 0x65))).toBe(
      'Été œuvre',
    );
  });
});
