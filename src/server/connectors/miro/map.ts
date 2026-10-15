import { htmlToText } from '../normalize';
import type { ConnectorItem } from '../types';
import type { Board, BoardItem } from './client';

// De la réponse de Miro à un élément du socle : un tableau est une page, son texte est celui de ses
// éléments, rangés par cadre (Miro n'a pas d'API pour les commentaires). Le tour `document` est
// daté de la dernière modification du tableau. Les images, vidéos, connecteurs et types inconnus
// n'ont pas de texte lu ; un tableau sans description ni texte n'est pas rendu.

const NO_TITLE = 'Cadre sans titre';

const clean = (text: string | null | undefined): string => text?.trim() ?? '';

// Une puce ; la suite d'un texte sur plusieurs paragraphes reste dans la même puce, sans ligne vide.
const bullet = (text: string): string =>
  text === '' ? '' : `- ${text.split(/\s*\n\s*/).join('\n  ')}`;

// Notes, textes et formes sont du HTML ; les cartes ont un titre et une description ; un document
// de Miro est du Markdown, gardé tel quel.
function lineOf(item: BoardItem): string {
  const { content, title, description } = item.data ?? {};
  switch (item.type) {
    case 'sticky_note':
    case 'text':
    case 'shape':
      return bullet(htmlToText(content ?? '').trim());
    case 'card':
    case 'app_card':
      return bullet([clean(title), clean(description)].filter(Boolean).join(' : '));
    case 'doc_format':
      return clean(content);
    default:
      return '';
  }
}

// Hors cadre d'abord, puis un titre par cadre qui a du texte. Le découpage des tours du socle coupe
// avant ces titres.
function blocks(items: BoardItem[]): string[] {
  const titles = new Map(
    items.filter((item) => item.type === 'frame').map((item) => [item.id, clean(item.data?.title)]),
  );
  const loose: string[] = [];
  const byFrame = new Map<string, string[]>();
  for (const item of items) {
    const line = lineOf(item);
    if (line === '') continue;
    const frame = item.parent && titles.has(item.parent.id) ? item.parent.id : null;
    if (frame === null) loose.push(line);
    else byFrame.set(frame, [...(byFrame.get(frame) ?? []), line]);
  }
  const frames = [...byFrame].map(
    ([id, lines]) => `## ${titles.get(id) || NO_TITLE}\n${lines.join('\n')}`,
  );
  return [loose.join('\n'), ...frames];
}

export function boardToItem(board: Board, items: BoardItem[]): ConnectorItem | null {
  const text = [clean(board.description), ...blocks(items)].filter(Boolean).join('\n\n');
  if (text === '') return null;
  const updatedAt = new Date(board.time).toISOString();
  const team = clean(board.team?.name);
  const project = clean(board.project?.name);
  return {
    externalId: `board:${board.id}`,
    nature: 'page',
    title: board.name,
    url: board.viewLink ?? null,
    updatedAt,
    origin: { ...(team ? { team } : {}), ...(project ? { project } : {}) },
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: { name: board.owner?.name ?? null, email: null },
        text,
        ts: updatedAt,
      },
    ],
  };
}
