import { z } from 'zod';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
} from '../http';

// Les requêtes vers l'API REST de GitHub et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.github.com';
const ISSUES_PER_PAGE = 50;
const COMMENTS_PER_PAGE = 100; // le maximum de GitHub

const Author = z.object({ login: z.string() }).nullish(); // nul quand le compte a été supprimé
// Le lien de l'auteur avec le dépôt (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE…) : GitHub le donne
// pour un ticket, une PR, un commentaire et un avis. Il dit si l'auteur est de l'équipe, pas son nom.
const Association = z.string().nullish();

export const IssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  html_url: z.string(),
  user: Author,
  author_association: Association,
  updated_at: z.string(),
  comments: z.number().optional(), // nombre de commentaires : 0 évite une requête
  pull_request: z.looseObject({}).nullish(), // présent seulement pour une PR
});
export const CommentSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  user: Author,
  author_association: Association,
  created_at: z.string(),
});
export const ReviewSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  user: Author,
  author_association: Association,
  state: z.string(),
  submitted_at: z.string().nullish(), // absent tant que l'avis est un brouillon
});
export const ReviewCommentSchema = CommentSchema.extend({ path: z.string() });

export type Issue = z.infer<typeof IssueSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export function githubClient(token: string, http: ConnectorHttp) {
  // GitHub exige un User-Agent : sans lui, la requête est refusée.
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Leon',
  };

  // Une page à la fois ; la suivante par l'adresse que GitHub donne dans l'en-tête Link.
  async function* pages<T>(first: HttpRequest, schema: z.ZodType<T[]>): AsyncGenerator<T[]> {
    let request: HttpRequest | null = first;
    while (request) {
      const { data, nextUrl }: { data: T[]; nextUrl: string | null } = await http.page(
        request,
        schema,
      );
      yield data;
      request = nextUrl ? { url: nextUrl, headers } : null;
    }
  }

  async function all<T>(path: string, schema: z.ZodType<T[]>): Promise<T[]> {
    const request = { url: `${API}${path}`, headers, query: { per_page: COMMENTS_PER_PAGE } };
    const rows: T[] = [];
    for await (const page of pages(request, schema)) rows.push(...page);
    return rows;
  }

  return {
    account: () => http.json({ url: `${API}/user`, headers }, z.object({ login: z.string() })),

    // GitHub répond 404 à un dépôt privé hors de portée du jeton, et 403 à un jeton sans accès.
    async checkRepo(repo: string): Promise<void> {
      try {
        await http.json({ url: `${API}/repos/${repo}`, headers }, z.looseObject({}));
      } catch (error) {
        const denied = error instanceof ConnectorAuthError && error.status === 403;
        const missing = error instanceof ConnectorHttpError && error.status === 404;
        if (denied || missing) {
          throw new ConnectorHttpError(denied ? 403 : 404, `Dépôt inaccessible : ${repo}`);
        }
        throw error;
      }
    },

    // Tickets et PR modifiés depuis `since` (format AAAA-MM-JJTHH:MM:SSZ), du plus ancien au plus récent.
    issues: (repo: string, since: string) =>
      pages(
        {
          url: `${API}/repos/${repo}/issues`,
          headers,
          query: {
            state: 'all',
            sort: 'updated',
            direction: 'asc',
            since,
            per_page: ISSUES_PER_PAGE,
          },
        },
        z.array(IssueSchema),
      ),

    // Les PR seules, avec le même contrat que `issues` (modifiées depuis `since`, de la plus ancienne à
    // la plus récente) : pour un dépôt dont les tickets sont désactivés. La liste des PR n'a pas de
    // paramètre `since` : on la lit de la plus récente à la plus ancienne, on s'arrête à la première
    // plus ancienne que `since`, puis on remet l'ordre. Elle n'a ni `comments` ni `pull_request` :
    // le second est ajouté, le premier reste absent (les commentaires sont alors toujours demandés).
    async *pullRequests(repo: string, since: string): AsyncGenerator<Issue[]> {
      const limit = Date.parse(since);
      const request = {
        url: `${API}/repos/${repo}/pulls`,
        headers,
        query: { state: 'all', sort: 'updated', direction: 'desc', per_page: ISSUES_PER_PAGE },
      };
      const recent: Issue[] = [];
      read: for await (const page of pages(request, z.array(IssueSchema))) {
        for (const pull of page) {
          if (Date.parse(pull.updated_at) < limit) break read;
          recent.push({ ...pull, pull_request: {} });
        }
      }
      recent.reverse();
      for (let start = 0; start < recent.length; start += ISSUES_PER_PAGE) {
        yield recent.slice(start, start + ISSUES_PER_PAGE);
      }
    },

    issueComments: (repo: string, number: number) =>
      all(`/repos/${repo}/issues/${number}/comments`, z.array(CommentSchema)),
    reviews: (repo: string, number: number) =>
      all(`/repos/${repo}/pulls/${number}/reviews`, z.array(ReviewSchema)),
    reviewComments: (repo: string, number: number) =>
      all(`/repos/${repo}/pulls/${number}/comments`, z.array(ReviewCommentSchema)),
  };
}

export type GithubClient = ReturnType<typeof githubClient>;
