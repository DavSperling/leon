import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

// Les requêtes vers l'API de Zendesk Support et la forme des réponses lues (seulement les champs utiles).

export type ZendeskAccess = { subdomain: string; email: string; apiToken: string };

const EXPORT_PAGE_SIZE = 100;
const COMMENTS_PAGE_SIZE = 100;
const COMMENTS_MAX = 1000; // plus de commentaires que cela sur un ticket : on garde les plus anciens

const DateText = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const MeSchema = z.object({
  user: z.object({ name: z.string().nullish(), email: z.string().nullish() }),
});

export const TicketSchema = z.object({
  id: z.number(),
  subject: z.string().nullish(), // absent sur un appel ou un message sans objet
  status: z.string().nullish(),
  priority: z.string().nullish(),
  type: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  submitter_id: z.number().nullish(), // il signe le premier commentaire du ticket
  updated_at: DateText,
});
const ExportPageSchema = z.object({
  tickets: z.array(TicketSchema),
  after_cursor: z.string().nullish(),
  end_of_stream: z.boolean(),
});

const UserSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  email: z.string().nullish(),
});
export const CommentSchema = z.object({
  id: z.number(),
  author_id: z.number().nullish(), // -1 pour le système
  plain_body: z.string().nullish(),
  body: z.string().nullish(),
  public: z.boolean().nullish(), // faux pour une note interne
  created_at: DateText,
});
const CommentsPageSchema = z.object({
  comments: z.array(CommentSchema),
  users: z.array(UserSchema).optional(),
  meta: z.object({ has_more: z.boolean() }).nullish(),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type User = z.infer<typeof UserSchema>;
export type TicketComments = { comments: Comment[]; users: Map<number, User> };

export function zendeskClient(access: ZendeskAccess, http: ConnectorHttp) {
  const base = `https://${access.subdomain}.zendesk.com/api/v2`;
  const credentials = Buffer.from(`${access.email}/token:${access.apiToken}`).toString('base64');
  const headers = { Authorization: `Basic ${credentials}` };

  return {
    me: () => http.json({ url: `${base}/users/me`, headers }, MeSchema),

    // Une page de l'export incrémental : depuis `since` au premier passage, depuis le curseur ensuite.
    exportPage(cursor: string | null, since: Date) {
      const start =
        cursor === null ? { start_time: Math.floor(since.getTime() / 1000) } : { cursor };
      const query = { ...start, per_page: EXPORT_PAGE_SIZE };
      return http.json(
        { url: `${base}/incremental/tickets/cursor`, headers, query },
        ExportPageSchema,
      );
    },

    // Les commentaires d'un ticket, du plus ancien au plus récent, avec leurs auteurs. La page
    // suivante est l'adresse que Zendesk donne (`links.next`), qui garde les mêmes paramètres.
    async comments(ticketId: number): Promise<TicketComments> {
      const comments: Comment[] = [];
      const users = new Map<number, User>();
      let request: HttpRequest = {
        url: `${base}/tickets/${ticketId}/comments`,
        headers,
        query: { include: 'users', 'page[size]': COMMENTS_PAGE_SIZE, sort: 'created_at' },
      };
      for (;;) {
        const page = await http.json(request, CommentsPageSchema);
        comments.push(...page.comments);
        for (const user of page.users ?? []) users.set(user.id, user);
        const next = page.links?.next;
        if (page.meta?.has_more !== true || !next || comments.length >= COMMENTS_MAX) {
          return { comments, users };
        }
        request = { url: next, headers };
      }
    },
  };
}

export type ZendeskClient = ReturnType<typeof zendeskClient>;
