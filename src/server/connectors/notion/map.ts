import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { ConnectorItem, ConnectorTurn } from '../types';
import { pageText, plainText } from './blocks';
import { type Api, fetchComments, fetchUser, type NotionPage } from './client';

// D'une page Notion à un élément : son corps, puis ses commentaires.

type Author = ConnectorTurn['author'];
const NOBODY: Author = { name: null, email: null };

// Une ressource secondaire ou retirée n'arrête pas le passage : 403 (capacité non cochée dans la
// connexion) et 404 (retirée depuis) rendent la valeur de repli. Tout le reste remonte, 401 compris.
async function ignoring<T>(call: Promise<T>, statuses: number[], fallback: T): Promise<T> {
  try {
    return await call;
  } catch (error) {
    const known = error instanceof ConnectorAuthError || error instanceof ConnectorHttpError;
    if (known && error.status !== null && statuses.includes(error.status)) return fallback;
    throw error;
  }
}

// Qui est l'auteur d'un identifiant : demandé une fois par personne pour tout le passage.
export function createAuthors(api: Api): (userId: string | undefined) => Promise<Author> {
  const known = new Map<string, Promise<Author>>();
  return (userId) => {
    if (userId === undefined) return Promise.resolve(NOBODY);
    let author = known.get(userId);
    if (author === undefined) {
      const lookup = fetchUser(api, userId).then((user) => ({
        name: user.name ?? null,
        email: user.person?.email ?? null,
      }));
      author = ignoring(lookup, [403, 404], NOBODY);
      known.set(userId, author);
    }
    return author;
  };
}

function titleOf(page: NotionPage): string {
  const title = Object.values(page.properties ?? {}).find((property) => property.type === 'title');
  return plainText(title?.title) || 'Sans titre';
}

function parentLabel(parent: NotionPage['parent']): string | null {
  if (!parent) return null;
  const id = parent[parent.type];
  return typeof id === 'string' ? `${parent.type}:${id}` : parent.type;
}

// null si la page a été retirée depuis la recherche, ou n'a ni texte ni commentaire.
export async function pageToItem(
  api: Api,
  authors: (userId: string | undefined) => Promise<Author>,
  page: NotionPage,
): Promise<ConnectorItem | null> {
  const body = await ignoring(pageText(api, page.id), [404], null);
  if (body === null) return null;
  const comments = await ignoring(fetchComments(api, page.id), [403, 404], []);

  const turns: ConnectorTurn[] = [];
  if (body !== '') {
    turns.push({
      externalId: 'body',
      role: 'document',
      author: await authors(page.created_by?.id ?? page.last_edited_by?.id),
      text: body,
      ts: page.last_edited_time,
    });
  }
  const chronological = comments.toSorted(
    (a, b) => Date.parse(a.created_time) - Date.parse(b.created_time),
  );
  for (const comment of chronological) {
    const text = plainText(comment.rich_text);
    if (text === '') continue;
    const author = await authors(comment.created_by?.id);
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: {
        name: author.name ?? comment.display_name?.resolved_name ?? null,
        email: author.email,
      },
      text,
      ts: comment.created_time,
    });
  }
  if (turns.length === 0) return null;

  const parent = parentLabel(page.parent);
  return {
    externalId: `page:${page.id}`,
    nature: 'page',
    title: titleOf(page),
    url: page.url ?? null,
    updatedAt: page.last_edited_time,
    origin: parent === null ? {} : { parent },
    turns,
  };
}
