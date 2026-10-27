import { randomBytes } from 'node:crypto';
import { PROVIDER_LABELS } from '@/lib/providers';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  GOOGLE_RATE_LIMIT,
  ResponseTooBigError,
} from '../http';
import { type GmailMessage, ListSchema, MessageSchema, ProfileSchema } from './schemas';

// Les requêtes vers l'API Gmail. Les messages se lisent par lots (une requête, donc un crédit Pipedream,
// pour BATCH_SIZE messages) : https://developers.google.com/workspace/gmail/api/guides/batch

const GMAIL = 'https://gmail.googleapis.com';
export const LIST_SIZE = 100;
// Essai réel du 25/10 : 20 lectures par lot passent toutes ; à 50 ou 100, Gmail refuse 25 à 35 % des
// lectures (429, limite par utilisateur). Google conseille 50 au plus.
export const BATCH_SIZE = 20;
const ROUNDS_MAX = 3;

type Answer = { index: number; status: number; body: string };

// Une réponse de lot : une partie par lecture, « Content-ID: <response-itemN> », la ligne d'état, ses
// en-têtes, une ligne vide, puis le JSON.
export function parseBatch(text: string, type: string | null): Answer[] {
  const boundary = /boundary="?([^";\s]+)"?/i.exec(type ?? '')?.[1];
  if (!boundary) throw new ConnectorHttpError(null, 'Unexpected response');
  const answers: Answer[] = [];
  for (const part of text.split(`--${boundary}`)) {
    const index = /content-id:\s*<response-item(\d+)>/i.exec(part)?.[1];
    const statusAt = part.search(/HTTP\/[\d.]+ \d{3}/);
    if (index === undefined || statusAt < 0) continue;
    const response = part.slice(statusAt);
    const status = Number(/HTTP\/[\d.]+ (\d{3})/.exec(response)?.[1]);
    const blank = response.search(/\r?\n\r?\n/);
    answers.push({
      index: Number(index),
      status,
      body: blank < 0 ? '' : response.slice(blank).trim(),
    });
  }
  return answers;
}

function batchBody(ids: string[], boundary: string): string {
  const parts = ids.map((id, index) =>
    [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <item${index}>`,
      '',
      `GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
      '',
      '',
    ].join('\r\n'),
  );
  return `${parts.join('')}--${boundary}--\r\n`;
}

export function gmailClient(http: ConnectorHttp) {
  // Un lot : les messages lus, et ceux à redemander (limite atteinte, erreur passagère, partie absente).
  // Un message supprimé entre la liste et la lecture (404) est laissé de côté. Google refuse une
  // lecture pour sa limite par un 429 ou par un 403 dont le corps dit rateLimitExceeded.
  async function batch(ids: string[]): Promise<{ read: GmailMessage[]; again: string[] }> {
    const boundary = `leon_${randomBytes(12).toString('hex')}`;
    const { text, type } = await http.text({
      url: `${GMAIL}/batch/gmail/v1`,
      method: 'POST',
      headers: { accept: '*/*' },
      raw: { type: `multipart/mixed; boundary=${boundary}`, text: batchBody(ids, boundary) },
    });
    const answers = new Map(parseBatch(text, type).map((answer) => [answer.index, answer]));
    const read: GmailMessage[] = [];
    const again: string[] = [];
    for (const [index, id] of ids.entries()) {
      const answer = answers.get(index);
      const limited = answer?.status === 403 && GOOGLE_RATE_LIMIT.test(answer.body);
      if (!answer || limited || answer.status === 429 || answer.status >= 500) again.push(id);
      else if (answer.status === 401 || answer.status === 403)
        throw new ConnectorAuthError(PROVIDER_LABELS.gmail, answer.status);
      else if (answer.status >= 200 && answer.status < 300) {
        let value: unknown;
        try {
          value = JSON.parse(answer.body);
        } catch {
          throw new ConnectorHttpError(answer.status, 'Unreadable response');
        }
        const parsed = MessageSchema.safeParse(value);
        if (!parsed.success) throw new ConnectorHttpError(answer.status, 'Unexpected response');
        read.push(parsed.data);
      } else if (answer.status !== 404 && answer.status !== 400)
        throw new ConnectorHttpError(answer.status, `Gmail responded with ${answer.status}`);
    }
    return { read, again };
  }

  // Une réponse de lot au-delà de 10 Mo (des courriers HTML très lourds) : le lot est coupé en deux,
  // et un courrier trop gros à lui seul est laissé de côté plutôt que de bloquer la boîte.
  async function batchOrSplit(ids: string[]): Promise<{ read: GmailMessage[]; again: string[] }> {
    try {
      return await batch(ids);
    } catch (error) {
      if (!(error instanceof ResponseTooBigError)) throw error;
      if (ids.length === 1) return { read: [], again: [] };
      const half = Math.ceil(ids.length / 2);
      const first = await batchOrSplit(ids.slice(0, half));
      const second = await batchOrSplit(ids.slice(half));
      return { read: [...first.read, ...second.read], again: [...first.again, ...second.again] };
    }
  }

  return {
    profile() {
      return http.json({ url: `${GMAIL}/gmail/v1/users/me/profile` }, ProfileSchema);
    },

    list(q: string, pageToken: string | null) {
      const query = { q, maxResults: LIST_SIZE, pageToken: pageToken ?? undefined };
      return http.json({ url: `${GMAIL}/gmail/v1/users/me/messages`, query }, ListSchema);
    },

    // Au plus BATCH_SIZE messages. Les lectures refusées pour la limite sont redemandées tout de suite,
    // deux fois au plus.
    // shortcut: pas d'attente entre deux essais (le client HTTP n'en expose pas) ; à revoir si les 429 reviennent.
    async messages(ids: string[]): Promise<GmailMessage[]> {
      const read: GmailMessage[] = [];
      let missing = ids;
      for (let round = 0; round < ROUNDS_MAX && missing.length > 0; round++) {
        const answer = await batchOrSplit(missing);
        read.push(...answer.read);
        missing = answer.again;
      }
      if (missing.length > 0) throw new ConnectorHttpError(429, 'Gmail rate limit reached');
      return read;
    },
  };
}
