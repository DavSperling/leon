import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { OfficeParser, type SupportedFileType } from 'officeparser';

const MAX_FILES = 300;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK_CHARS = 1_600;
const FORMATS: Record<string, SupportedFileType> = {
  csv: 'csv',
  docx: 'docx',
  epub: 'epub',
  html: 'html',
  md: 'md',
  odt: 'odt',
  ods: 'ods',
  pdf: 'pdf',
  pptx: 'pptx',
  rtf: 'rtf',
  tex: 'tex',
  txt: 'md',
  xlsx: 'xlsx',
};

export type LocalPassage = { path: string; text: string };

async function filesIn(
  directory: string,
  found: string[],
  remaining: { count: number },
): Promise<void> {
  if (remaining.count <= 0) return;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (remaining.count <= 0) break;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await filesIn(path, found, remaining);
    else if (entry.isFile() && FORMATS[extname(entry.name).slice(1).toLowerCase()]) {
      found.push(path);
      remaining.count -= 1;
    }
  }
}

async function extract(path: string): Promise<string> {
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_FILE_BYTES) return '';
  const extension = extname(path).slice(1).toLowerCase();
  if (extension === 'txt' || extension === 'md' || extension === 'csv') {
    return new TextDecoder().decode(bytes).replaceAll('\0', '').slice(0, 100_000);
  }
  const ast = await OfficeParser.parseOffice(new Uint8Array(bytes), {
    fileType: FORMATS[extension],
    decompressionLimits: {
      maxUncompressedBytes: 50 * 1024 * 1024,
      maxZipEntries: 2_000,
      maxTableCells: 200_000,
      maxXmlElements: 300_000,
      maxRepeatedContent: 100_000,
      maxRawContentLength: 100_000,
    },
  });
  return (await ast.to('text')).value.replaceAll('\0', '').slice(0, 100_000);
}

function chunks(path: string, text: string): LocalPassage[] {
  const paragraphs = text.replace(/\r/g, '').split(/\n{2,}/);
  const passages: LocalPassage[] = [];
  let chunk = '';
  for (const paragraph of paragraphs) {
    const next = `${chunk}${chunk ? '\n' : ''}${paragraph}`;
    if (next.length > CHUNK_CHARS && chunk) {
      passages.push({ path, text: chunk });
      chunk = `${chunk.slice(-200)}\n${paragraph}`;
    } else chunk = next;
  }
  if (chunk.trim()) passages.push({ path, text: chunk.trim() });
  return passages;
}

function words(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .match(/[\p{L}\p{N}]{3,}/gu) ?? []
  );
}

export async function loadLocalDocuments(directory: string): Promise<LocalPassage[]> {
  const root = resolve(directory);
  if (!(await stat(root).catch(() => null))?.isDirectory()) {
    throw new Error(`Dossier introuvable : ${root}`);
  }
  const paths: string[] = [];
  await filesIn(root, paths, { count: MAX_FILES });
  const passages: LocalPassage[] = [];
  for (const path of paths) {
    try {
      passages.push(...chunks(relative(root, path), await extract(path)));
    } catch {
      // Un fichier illisible ne bloque pas l'indexation du dossier.
    }
  }
  return passages;
}

export function findLocalPassages(passages: LocalPassage[], query: string): LocalPassage[] {
  const terms = new Set(words(query));
  return passages
    .map((passage) => {
      const body = new Set(words(passage.text));
      return {
        ...passage,
        score: [...terms].reduce((sum, term) => sum + Number(body.has(term)), 0),
      };
    })
    .filter((passage) => passage.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ path, text }) => ({ path, text }));
}
