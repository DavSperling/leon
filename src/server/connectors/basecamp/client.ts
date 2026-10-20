import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

// Les requêtes vers l'API de Basecamp et la forme des réponses lues (seulement les champs utiles).

export const API_HOST = '3.basecampapi.com';
// Basecamp répond 400 sans User-Agent qui dise qui appelle, avec un nom et un lien ou une adresse
// (README de l'API). C'est le lien du dépôt de Leon, faute d'adresse de contact : à remplacer par
// celle que l'équipe choisit.
export const USER_AGENT = 'Leon (https://github.com/DavSperling/leon)';

const COMMENT_PAGES_MAX = 10; // au-delà (une page = 50 à 100 commentaires), le reste est ignoré

export type Kind = 'message' | 'document';
// `type` : celui de la liste des enregistrements ; `path` : la route de l'élément.
export const KINDS: Record<Kind, { type: string; path: string }> = {
  message: { type: 'Message', path: 'messages' },
  document: { type: 'Document', path: 'documents' },
};

const Person = z
  .object({
    name: z.string(),
    email_address: z.string().nullish(),
    client: z.boolean().optional(), // vrai pour un client invité sur un projet
  })
  .nullish();

// La liste des enregistrements ne donne pas le texte : elle sert à repérer ce qui a changé.
export const ListedSchema = z.object({ id: z.number(), updated_at: z.string() });
export const ItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string().nullish(), // HTML
  updated_at: z.string(),
  app_url: z.string().nullish(),
  comments_count: z.number().optional(),
  bucket: z.object({ name: z.string() }).nullish(),
  creator: Person,
});
export const CommentSchema = z.object({
  id: z.number(),
  content: z.string().nullish(), // HTML
  created_at: z.string(),
  creator: Person,
});

export type Listed = z.infer<typeof ListedSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Comment = z.infer<typeof CommentSchema>;

export function basecampClient(
  config: { accessToken: string; accountId: string },
  http: ConnectorHttp,
) {
  const base = `https://${API_HOST}/${config.accountId}`;
  const headers = { authorization: `Bearer ${config.accessToken}`, 'user-agent': USER_AGENT };

  return {
    base,

    profile: () =>
      http.json(
        { url: `${base}/my/profile.json`, headers },
        z.object({ id: z.number(), name: z.string() }),
      ),

    // Les enregistrements d'un type, tous projets actifs confondus, du plus récemment modifié au plus
    // ancien. `next` : l'adresse de la page suivante que Basecamp a donnée dans l'en-tête Link.
    list(kind: Kind, next: string | null) {
      const request: HttpRequest = next
        ? { url: next, headers }
        : {
            url: `${base}/projects/recordings.json`,
            headers,
            query: {
              type: KINDS[kind].type,
              status: 'active',
              sort: 'updated_at',
              direction: 'desc',
            },
          };
      return http.page(request, z.array(ListedSchema));
    },

    item: (kind: Kind, id: number) =>
      http.json({ url: `${base}/${KINDS[kind].path}/${id}.json`, headers }, ItemSchema),

    // Les commentaires d'un enregistrement, page après page (par l'en-tête Link).
    async comments(id: number): Promise<Comment[]> {
      const rows: Comment[] = [];
      let request: HttpRequest | null = { url: `${base}/recordings/${id}/comments.json`, headers };
      for (let page = 0; request && page < COMMENT_PAGES_MAX; page++) {
        const { data, nextUrl }: { data: Comment[]; nextUrl: string | null } = await http.page(
          request,
          z.array(CommentSchema),
        );
        rows.push(...data);
        request = nextUrl ? { url: nextUrl, headers } : null;
      }
      return rows;
    },
  };
}

export type BasecampClient = ReturnType<typeof basecampClient>;
