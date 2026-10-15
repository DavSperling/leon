import type { ConnectorItem, ConnectorTurn } from '../types';
import { wikiUrl } from './client';
import type { Directory } from './directory';
import type { Loaded } from './read';
import { storageToText } from './storage';

// D'une page Confluence à un élément : son corps, puis ses commentaires du plus ancien au plus récent.

// Les identifiants à demander à l'annuaire pour un lot de pages.
export function accountIdsOf(loaded: Loaded[]): string[] {
  return loaded
    .flatMap(({ page, comments }) => [
      page.authorId ?? page.version.authorId,
      ...comments.map((comment) => comment.version.authorId),
    ])
    .filter((id): id is string => typeof id === 'string');
}

export function spaceIdsOf(loaded: Loaded[]): string[] {
  return loaded
    .map(({ page }) => page.spaceId)
    .filter((id): id is string => typeof id === 'string');
}

// Le lien de l'API s'il y en a un ; sinon l'adresse permanente d'une page par son numéro.
function pageUrl(site: string, page: Loaded['page']): string {
  const webui = page._links?.webui;
  if (webui?.startsWith('/')) return `${wikiUrl(site)}${webui}`;
  return `${wikiUrl(site)}/pages/viewpage.action?pageId=${page.id}`;
}

// null si la page n'a ni texte ni commentaire.
export function pageToItem(
  site: string,
  { page, comments }: Loaded,
  directory: Directory,
): ConnectorItem | null {
  const turns: ConnectorTurn[] = [];
  const body = storageToText(page.body?.storage?.value ?? '');
  if (body !== '') {
    turns.push({
      externalId: 'body',
      role: 'document',
      // Le créateur de la page, à défaut l'auteur de la dernière version.
      author: directory.author(page.authorId ?? page.version.authorId),
      text: body,
      ts: page.version.createdAt,
    });
  }
  const chronological = comments.toSorted(
    (a, b) =>
      Date.parse(a.version.createdAt) - Date.parse(b.version.createdAt) || a.id.localeCompare(b.id),
  );
  for (const comment of chronological) {
    const text = storageToText(comment.body?.storage?.value ?? '');
    if (text === '') continue;
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: directory.author(comment.version.authorId),
      text,
      ts: comment.version.createdAt, // la date de sa dernière version : l'API ne donne pas celle de la création
    });
  }
  if (turns.length === 0) return null;

  const space = directory.space(page.spaceId) ?? page.spaceId;
  return {
    externalId: `page:${page.id}`,
    nature: 'page',
    title: page.title,
    url: pageUrl(site, page),
    updatedAt: page.version.createdAt,
    origin: space ? { site, space } : { site },
    turns,
  };
}
