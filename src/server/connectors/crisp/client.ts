import { z } from 'zod';
import { type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API REST de Crisp et la forme des réponses lues (seulement les champs utiles).
// Chaque réponse est une enveloppe { error, reason, data } : seule `data` nous intéresse.

const API = 'https://api.crisp.chat/v1/website';
const PER_PAGE = 50; // le maximum de la doc (de 20 à 50)

export type Credentials = { websiteId: string; identifier: string; key: string };

const envelope = <T extends z.ZodType>(data: T) => z.object({ data });

const ConversationSchema = z.object({
  session_id: z.string(),
  updated_at: z.number(), // millisecondes depuis 1970 (non dit par la doc, voir connector.ts)
  meta: z
    .object({
      nickname: z.string().nullish(),
      email: z.string().nullish(),
      subject: z.string().nullish(),
    })
    .nullish(),
});
const MessageSchema = z.object({
  type: z.string(), // text, note, file, event… : seuls text et note ont un contenu en texte
  from: z.string().nullish(), // « user » (le visiteur) ou « operator » (l'équipe)
  content: z.unknown(), // une chaîne pour text et note, un objet pour les autres types
  fingerprint: z.number().optional(),
  timestamp: z.number(),
  user: z.object({ nickname: z.string().nullish() }).nullish(),
});
const WebsiteSchema = z.object({ name: z.string(), domain: z.string().nullish() });

export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;

export function crispClient(credentials: Credentials, http: ConnectorHttp) {
  const site = `${API}/${credentials.websiteId}`;
  const pair = `${credentials.identifier}:${credentials.key}`;
  const headers = {
    authorization: `Basic ${Buffer.from(pair).toString('base64')}`,
    'x-crisp-tier': 'website',
  };

  return {
    async account(): Promise<string> {
      try {
        const { data } = await http.json({ url: site, headers }, envelope(WebsiteSchema));
        return data.domain ? `${data.name} (${data.domain})` : data.name;
      } catch (error) {
        if (error instanceof ConnectorHttpError && error.status === 404) {
          throw new ConnectorHttpError(404, 'Site Crisp introuvable : vérifiez son identifiant');
        }
        throw error;
      }
    },

    // Les conversations modifiées entre `from` et `until` (sans borne de fin si `until` manque),
    // toutes les pages. La doc ne dit pas dans quel ordre Crisp les rend : l'appelant trie.
    async conversations(from: Date, until?: Date): Promise<Conversation[]> {
      const rows = new Map<string, Conversation>();
      for (let page = 1; ; page++) {
        const { data } = await http.json(
          {
            url: `${site}/conversations/${page}`,
            headers,
            query: {
              per_page: PER_PAGE,
              filter_date_start: from.toISOString(),
              filter_date_end: until?.toISOString(),
            },
          },
          envelope(z.array(ConversationSchema)),
        );
        const known = rows.size;
        for (const row of data) rows.set(row.session_id, row);
        // Une page courte est la dernière ; une page qui n'apporte rien de nouveau coupe court
        // à une boucle si Crisp ignorait le numéro de page.
        if (data.length < PER_PAGE || rows.size === known) return [...rows.values()];
      }
    },

    // Tous les messages d'une conversation. Crisp rend d'abord le dernier lot, puis des lots plus
    // anciens avec `timestamp_before` : on remonte jusqu'à un lot qui n'apporte rien de plus ancien.
    async messages(sessionId: string): Promise<Message[]> {
      const rows: Message[] = [];
      let before = Number.POSITIVE_INFINITY;
      for (;;) {
        const { data } = await http.json(
          {
            url: `${site}/conversation/${encodeURIComponent(sessionId)}/messages`,
            headers,
            query: { timestamp_before: Number.isFinite(before) ? before : undefined },
          },
          envelope(z.array(MessageSchema)),
        );
        const older = data.filter((message) => message.timestamp < before);
        if (older.length === 0) return rows;
        rows.push(...older);
        before = Math.min(...older.map((message) => message.timestamp));
      }
    },
  };
}

export type CrispClient = ReturnType<typeof crispClient>;
