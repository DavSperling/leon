import { z } from 'zod';
import { type ConnectorHttp, ConnectorHttpError, type HttpRequest } from '../http';

// Les requêtes vers l'API de Front et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api2.frontapp.com';
const EVENTS_PER_PAGE = 15; // le maximum de la liste des événements
const MESSAGES_PER_PAGE = 50;
const PAGES_MAX = 40;
// Un nouveau message, une réponse envoyée, un commentaire : les trois façons d'ajouter du texte.
const EVENT_TYPES = ['inbound', 'outbound', 'out_reply', 'comment'];

// Front date en secondes depuis 1970, avec des décimales. Le plafond (2100) évite une date invalide.
const Seconds = z.number().min(0).max(4_102_444_800);

const TeammateSchema = z.object({
  email: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  username: z.string().nullish(),
});
const EventSchema = z.object({
  id: z.string(),
  emitted_at: Seconds,
  conversation: z.object({ id: z.string(), subject: z.string().nullish() }).nullish(),
});
const MessageSchema = z.object({
  id: z.string(),
  created_at: Seconds,
  draft_mode: z.string().nullish(), // non nul pour un brouillon
  author: TeammateSchema.nullish(), // nul pour un message reçu : l'expéditeur est dans recipients
  is_inbound: z.boolean().nullish(), // vrai pour un message reçu
  recipients: z
    .array(z.object({ handle: z.string(), role: z.string(), name: z.string().nullish() }))
    .nullish(),
  body: z.string().nullish(), // HTML
  text: z.string().nullish(), // version texte, pour les e-mails
});
const CommentSchema = z.object({
  id: z.string(),
  posted_at: Seconds,
  author: TeammateSchema.nullish(),
  body: z.string().nullish(),
});
const IdentitySchema = z.object({ name: z.string() });

const listOf = <T extends z.ZodType>(item: T) =>
  z.object({
    _pagination: z.object({ next: z.string().nullish() }).nullish(),
    _results: z.array(item),
  });

type Page<T> = { results: T[]; next: string | null };

export type FrontEvent = z.infer<typeof EventSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Teammate = z.infer<typeof TeammateSchema>;

// Front rend l'adresse de la page suivante sur le sous-domaine de l'entreprise
// (https://acme.api.frontapp.com/…), que le client HTTP refuse. Sa doc dit que api2.frontapp.com
// marche toujours : on garde le chemin et la requête (filtres, tri et jeton de page), jamais l'hôte.
function onApi2(next: string | null | undefined): string | null {
  if (!next) return null;
  try {
    const url = new URL(next, API);
    return `${API}${url.pathname}${url.search}`;
  } catch {
    throw new ConnectorHttpError(null, 'Réponse inattendue');
  }
}

export function frontClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };

  async function page<T extends z.ZodType>(
    request: HttpRequest,
    item: T,
  ): Promise<Page<z.infer<T>>> {
    const body = await http.json({ ...request, headers }, listOf(item));
    return { results: body._results, next: onApi2(body._pagination?.next) };
  }

  // Toutes les pages d'une liste (les commentaires n'ont pas de pagination documentée : si Front en
  // rend une, on la suit).
  async function all<T extends z.ZodType>(request: HttpRequest, item: T) {
    const results: z.infer<T>[] = [];
    let current: HttpRequest | null = request;
    for (let number = 0; current !== null && number < PAGES_MAX; number++) {
      const batch: Page<z.infer<T>> = await page(current, item);
      results.push(...batch.results);
      current = batch.next === null ? null : { url: batch.next };
    }
    return results;
  }

  return {
    async company(): Promise<string> {
      return (await http.json({ url: `${API}/me`, headers }, IdentitySchema)).name;
    },

    // Essaie la liste des événements : un jeton sans le droit de la lire est refusé dès le test.
    async probe(): Promise<void> {
      await page({ url: `${API}/events`, query: { limit: 1 } }, EventSchema);
    },

    // Les événements émis après `after` (secondes), du plus ancien au plus récent.
    firstEvents: (after: string) =>
      page(
        {
          url: `${API}/events`,
          query: {
            'q[after]': after,
            'q[types]': EVENT_TYPES,
            limit: EVENTS_PER_PAGE,
            sort_by: 'created_at',
            sort_order: 'asc',
          },
        },
        EventSchema,
      ),

    nextEvents: (url: string) => page({ url }, EventSchema),

    messages: (id: string) =>
      all(
        { url: `${API}/conversations/${id}/messages`, query: { limit: MESSAGES_PER_PAGE } },
        MessageSchema,
      ),

    comments: (id: string) => all({ url: `${API}/conversations/${id}/comments` }, CommentSchema),
  };
}

export type FrontClient = ReturnType<typeof frontClient>;
