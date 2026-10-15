import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API REST v3 de Jira Cloud et la forme des réponses lues (seulement les champs utiles).

export type JiraAccess = { site: string; email: string; apiToken: string };

const SEARCH_PAGE_SIZE = 50; // des descriptions et des commentaires complets : des pages modestes
const COMMENTS_PAGE_SIZE = 100;
const COMMENTS_MAX = 1000; // plus de commentaires que cela sur un ticket : on garde les plus anciens
const FIELDS = 'summary,description,comment,creator,reporter,project,updated';

const User = z
  .object({ displayName: z.string().nullish(), emailAddress: z.string().nullish() })
  .nullish(); // nul quand le compte a été supprimé ; l'adresse est masquée selon les réglages du compte
const DateText = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

export const CommentSchema = z.object({
  id: z.string(),
  body: z.unknown(), // ADF : lu par adf.ts, qui accepte tout
  created: DateText,
  author: User,
});
const CommentsPageSchema = z.object({
  comments: z.array(CommentSchema),
  total: z.number().default(0),
});
export const IssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    description: z.unknown(),
    comment: CommentsPageSchema.nullish(),
    creator: User,
    reporter: User,
    project: z.object({ key: z.string() }).nullish(),
    updated: DateText,
  }),
});
const SearchSchema = z.object({
  issues: z.array(IssueSchema),
  nextPageToken: z.string().nullish(), // absent sur la dernière page
  isLast: z.boolean().optional(),
});
const MyselfSchema = z.object({
  displayName: z.string().nullish(),
  emailAddress: z.string().nullish(),
  timeZone: z.string().nullish(),
});

export type Issue = z.infer<typeof IssueSchema>;
export type Comment = z.infer<typeof CommentSchema>;

export function jiraClient(access: JiraAccess, http: ConnectorHttp) {
  const base = `https://${access.site}.atlassian.net/rest/api/3`;
  const credentials = Buffer.from(`${access.email}:${access.apiToken}`).toString('base64');
  const headers = { Authorization: `Basic ${credentials}` };

  return {
    myself: () => http.json({ url: `${base}/myself`, headers }, MyselfSchema),

    // Les tickets que la recherche JQL rend, une page à la fois (jeton de page, pas de numéro).
    async *search(jql: string): AsyncGenerator<Issue[]> {
      let nextPageToken: string | undefined;
      for (;;) {
        const request = {
          url: `${base}/search/jql`,
          headers,
          query: { jql, fields: FIELDS, maxResults: SEARCH_PAGE_SIZE, nextPageToken },
        };
        const page = await http.json(request, SearchSchema);
        if (page.issues.length === 0) return;
        yield page.issues;
        if (!page.nextPageToken || page.isLast === true) return;
        nextPageToken = page.nextPageToken;
      }
    },

    // Tous les commentaires d'un ticket, du plus ancien au plus récent.
    async comments(issueId: string): Promise<Comment[]> {
      const rows: Comment[] = [];
      for (;;) {
        const page = await http.json(
          {
            url: `${base}/issue/${encodeURIComponent(issueId)}/comment`,
            headers,
            query: { startAt: rows.length, maxResults: COMMENTS_PAGE_SIZE, orderBy: 'created' },
          },
          CommentsPageSchema,
        );
        rows.push(...page.comments);
        if (page.comments.length === 0 || rows.length >= Math.min(page.total, COMMENTS_MAX)) {
          return rows;
        }
      }
    },
  };
}

export type JiraClient = ReturnType<typeof jiraClient>;
