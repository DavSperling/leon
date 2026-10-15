import { type Api, fetchChildren, type NotionBlock, RichText } from './client';

// Le texte d'une page : ses blocs, du haut vers le bas, une ligne par bloc qui porte du texte.

// Niveaux de blocs lus sous la page : la page (1), ses blocs imbriqués (2 et 3). Au-delà, rien.
const LEVELS_MAX = 3;
const HEADINGS: Record<string, string> = {
  heading_1: '#',
  heading_2: '##',
  heading_3: '###',
  heading_4: '####',
};
// Le code n'est pas du texte à retenir. Le contenu d'une sous-page ou d'une base est une autre page,
// que la recherche rend à part : le lire ici le compterait deux fois.
const LEFT_OUT = new Set(['code', 'equation', 'child_page', 'child_database']);

export function plainText(richText: unknown): string {
  const parsed = RichText.safeParse(richText);
  return parsed.success
    ? parsed.data
        .map((part) => part.plain_text)
        .join('')
        .trim()
    : '';
}

function contentOf(block: NotionBlock): Record<string, unknown> {
  const content = block[block.type];
  return typeof content === 'object' && content !== null
    ? (content as Record<string, unknown>)
    : {};
}

// Une ligne de tableau : ses cellules, séparées par « | ».
function rowText(content: Record<string, unknown>): string {
  const cells = Array.isArray(content.cells) ? content.cells : [];
  const texts = cells.map(plainText);
  return texts.some((text) => text !== '') ? texts.join(' | ') : '';
}

// La ligne d'un bloc, ou null s'il ne porte pas de texte.
function lineOf(block: NotionBlock): string | null {
  if (LEFT_OUT.has(block.type)) return null;
  const content = contentOf(block);
  const text = block.type === 'table_row' ? rowText(content) : plainText(content.rich_text);
  if (text === '') return null;
  const heading = HEADINGS[block.type];
  if (heading !== undefined) return `${heading} ${text}`;
  if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
    return `- ${text}`;
  }
  if (block.type === 'to_do') return `- [${content.checked === true ? 'x' : ' '}] ${text}`;
  return block.type === 'quote' ? `> ${text}` : text;
}

// Un niveau de blocs, puis ceux de chaque bloc qui en a. Les enfants d'un bloc qui porte une ligne
// sont décalés d'un cran ; ceux d'un tableau ou d'une colonne ne le sont pas.
async function linesUnder(
  api: Api,
  parentId: string,
  level: number,
  indent: number,
): Promise<string[]> {
  const lines: string[] = [];
  for (const block of await fetchChildren(api, parentId)) {
    const line = lineOf(block);
    if (line !== null) lines.push('  '.repeat(indent) + line);
    if (block.has_children && level < LEVELS_MAX && !LEFT_OUT.has(block.type)) {
      const deeper = await linesUnder(
        api,
        block.id,
        level + 1,
        line === null ? indent : indent + 1,
      );
      lines.push(...deeper);
    }
  }
  return lines;
}

export async function pageText(api: Api, pageId: string): Promise<string> {
  return (await linesUnder(api, pageId, 1, 0)).join('\n');
}
