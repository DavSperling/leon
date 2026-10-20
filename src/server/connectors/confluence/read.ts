import {
  type Api,
  type ConfluenceComment,
  type ConfluencePage,
  fetchComments,
  fetchPage,
  fetchReplies,
} from './client';
import { ignoring } from './ignoring';

// Une page lue en entier : son corps, puis ses commentaires de pied de page et leurs réponses.

export type Loaded = { page: ConfluencePage; comments: ConfluenceComment[] };

// Commentaire, réponse, réponse à une réponse : au-delà, on ne descend pas (une requête par commentaire).
const THREAD_DEPTH_MAX = 3;

async function addThread(
  api: Api,
  comments: ConfluenceComment[],
  depth: number,
  into: ConfluenceComment[],
): Promise<void> {
  for (const comment of comments) {
    into.push(comment);
    if (depth < THREAD_DEPTH_MAX) {
      await addThread(api, await fetchReplies(api, comment.id), depth + 1, into);
    }
  }
}

async function readComments(api: Api, pageId: string): Promise<ConfluenceComment[]> {
  const all: ConfluenceComment[] = [];
  await addThread(api, await fetchComments(api, pageId), 1, all);
  return all;
}

// null si la page a été retirée depuis la liste (404) ou n'est plus lisible (403) : on la saute.
// Sans droit sur les commentaires (403), la page sort sans eux.
export async function readPage(api: Api, id: string): Promise<Loaded | null> {
  const page = await ignoring(fetchPage(api, id), [403, 404], null);
  if (page === null) return null;
  const comments = await ignoring(readComments(api, id), [403, 404], []);
  return { page, comments };
}
