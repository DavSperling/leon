import { randomBytes } from 'node:crypto';
import { PROVIDER_LABELS } from '@/lib/providers';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  GOOGLE_RATE_LIMIT,
  ResponseTooBigError,
} from '../http';
import { headerOf, parseAddress, parseAddressList } from './map';
import {
  DraftSchema,
  type GmailMessage,
  ListSchema,
  MessageSchema,
  ProfileSchema,
  ThreadSchema,
} from './schemas';

// Les requêtes vers l'API Gmail. Les messages se lisent par lots (une requête, donc un crédit Pipedream,
// pour BATCH_SIZE messages) : https://developers.google.com/workspace/gmail/api/guides/batch
//
// Les seules écritures (portrait/brouillon-depot.ts) : un brouillon créé dans un fil (replyHeaders, puis createDraft),
// la réponse de l'agent « Brouillons de réponse » à l'auteur du mail reçu, ou la relance de l'agent « Relances » aux
// destinataires de son mail resté sans réponse, en « à » et en copie, sans elle ; ce même brouillon supprimé
// (deleteDraft) quand elle l'écarte dans Leon, ou, pour une relance, quand son fil a bougé avant qu'elle l'envoie ; et
// ce brouillon envoyé (sendDraft) quand elle clique « Envoyer » dans Leon et le confirme. Rien d'autre n'est envoyé,
// supprimé ni modifié.
// Doc relue le 23/11/2026 :
//   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get (format=metadata,
//     metadataHeaders répété, gmail.modify accepté ; ce format ne rend que « IDs, labels, and email headers »)
//   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create (POST …/drafts, corps
//     { message: { raw, threadId } }, gmail.modify accepté)
//   https://developers.google.com/workspace/gmail/api/guides/drafts (raw : un message RFC 2822 en base64url)
//   https://developers.google.com/workspace/gmail/api/guides/threads (les messages d'un fil sont rendus dans l'ordre ;
//     pour rester dans le fil : threadId, In-Reply-To et References, et un objet qui correspond)
//   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/delete (DELETE …/drafts/<id>,
//     suppression immédiate et définitive, gmail.modify accepté)
//   https://pipedream.com/docs/connect/api-proxy (un POST avec un corps JSON passe ; 30 s au plus)
// Non vérifié : aucun brouillon réel n'a été créé. La documentation ne dit pas si un nom d'en-tête demandé dans une
// autre casse est rendu (« Message-Id »), ni si un message à la corbeille reste dans la lecture du fil.

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

    // Ce qu'il faut d'un message pour lui répondre dans son fil (reply.ts) : trois en-têtes, et `elsewhere`, vrai quand
    // il demande qu'on lui réponde à une autre adresse que celle de son expéditeur (Reply-To : le formulaire de contact
    // d'un site, une assistante). Le message reçu pour une réponse, son propre mail pour une relance. C'est le fil qui
    // se lit, sans les corps, pour savoir d'abord s'il attend toujours : Leon ne connaît la boîte que telle qu'à la
    // dernière relève. Rend null quand il n'y a plus à
    // répondre : le message n'y est plus, il est à la corbeille ou en indésirable, ou un message plus récent le suit
    // (elle a écrit depuis Gmail, ou on lui a écrit ; un brouillon ne compte pas). Une seule requête, un crédit ;
    // jamais rejouée, sauf par le proxy de Pipedream sur un 401, une fois, avec un jeton neuf (pipedream.ts).
    async replyHeaders(threadId: string, messageId: string) {
      const { messages } = await http.json(
        {
          url: `${GMAIL}/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
          query: {
            format: 'metadata',
            metadataHeaders: ['Message-ID', 'References', 'Subject', 'From', 'Reply-To'],
          },
          once: true,
        },
        ThreadSchema,
      );
      const index = messages?.findIndex((one) => one.id === messageId) ?? -1;
      const received = messages?.[index];
      const binned = received?.labelIds?.some((label) => label === 'TRASH' || label === 'SPAM');
      // Gmail rend les messages d'un fil dans l'ordre (guides/threads) : ce qui suit le message reçu est plus récent.
      // La date des messages n'est pas lue : la documentation ne la promet pas avec format=metadata.
      const followed = messages?.slice(index + 1).some((one) => !one.labelIds?.includes('DRAFT'));
      if (!received || binned || followed) return null;
      const from = parseAddress(headerOf(received.payload, 'from')).email?.toLowerCase();
      return {
        messageId: headerOf(received.payload, 'message-id'),
        references: headerOf(received.payload, 'references'),
        subject: headerOf(received.payload, 'subject'),
        elsewhere: parseAddressList(headerOf(received.payload, 'reply-to')).some(
          (address) => address.toLowerCase() !== from,
        ),
      };
    },

    // Un brouillon de plus dans le fil : la seule écriture de Leon dans une boîte, jamais un envoi. `raw` : le message
    // en RFC 2822, en base64url (reply.ts). Jamais rejouée : une réponse perdue a pu créer le brouillon. Seul un 401
    // l'est, une fois, par le proxy de Pipedream (pipedream.ts) : un accès refusé n'a rien créé. Rend son identifiant.
    async createDraft(threadId: string, raw: string): Promise<string> {
      const draft = await http.json(
        {
          url: `${GMAIL}/gmail/v1/users/me/drafts`,
          method: 'POST',
          body: { message: { threadId, raw } },
          once: true,
        },
        DraftSchema,
      );
      return draft.id;
    },

    // Envoie un brouillon que Leon a déposé (createDraft), tel qu'il est dans Gmail, quand elle clique « Envoyer » dans
    // Leon et le confirme : le seul envoi de Leon depuis une boîte, et jamais d'un autre brouillon. Jamais rejouée : une
    // réponse perdue a pu envoyer le mail. Seul un 401 l'est, une fois, par le proxy de Pipedream. Un brouillon qui n'y
    // est plus (elle l'a envoyé ou supprimé dans Gmail) rend 404 : lève, rien n'est parti.
    // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/send (POST …/drafts/send,
    // corps { id }, gmail.modify accepté ; rend le message envoyé)
    async sendDraft(draftId: string): Promise<void> {
      await http.text({
        url: `${GMAIL}/gmail/v1/users/me/drafts/send`,
        method: 'POST',
        body: { id: draftId },
        once: true,
      });
    },

    // Supprime un brouillon que Leon a déposé (createDraft), quand elle l'écarte dans Leon ou qu'une relance devient
    // inutile : la seule suppression de Leon dans une boîte, et jamais d'un autre message. Définitive, sans passer par
    // la corbeille. Un brouillon qui n'y est plus (elle l'a envoyé ou supprimé) rend 404 : il n'y a plus rien à
    // retirer. Jamais rejouée, sauf un 401 par le proxy de Pipedream.
    async deleteDraft(draftId: string): Promise<void> {
      try {
        await http.text({
          url: `${GMAIL}/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
          method: 'DELETE',
          once: true,
        });
      } catch (error) {
        if (!(error instanceof ConnectorHttpError && error.status === 404)) throw error;
      }
    },
  };
}
