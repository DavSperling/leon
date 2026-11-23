import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { GmailMessage, GmailPart } from './schemas';

// Des messages de Gmail aux éléments du socle, comme Outlook : un fil regroupe les messages d'une même
// conversation lus ensemble, chacun est un tour `participant` daté de sa réception. Le côté vient du
// libellé SENT (envoyé depuis la boîte) ; rien n'est déduit pour les autres. Les destinataires viennent
// des en-têtes To et Cc, jamais de Bcc. Un message reçu dit seulement s'il est envoyé par une machine ou en
// nombre (automated).

export const headerOf = (part: GmailPart | null | undefined, name: string): string | null =>
  part?.headers?.find((header) => header.name.toLowerCase() === name)?.value ?? null;

// Le corps d'une partie, en base64url. Gmail le rend déjà en UTF-8 même quand l'en-tête annonce un autre
// jeu (essai du 25/10 : « Windows-1252 » et des octets UTF-8) ; le jeu annoncé ne sert qu'aux octets qui
// ne sont pas de l'UTF-8.
function decode(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? '', 'base64url');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {}
  const charset = /charset="?([^";\s]+)"?/i.exec(headerOf(part, 'content-type') ?? '')?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return bytes.toString('utf8'); // jeu de caractères inconnu
  }
}

// La première partie du type demandé, hors pièces jointes, en profondeur.
function find(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.filename) return null;
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = find(child, mimeType);
    if (found) return found;
  }
  return null;
}

// Le texte brut si le message en a un, sinon son HTML converti.
export function textOf(payload: GmailPart | null | undefined): string {
  if (!payload) return '';
  const plain = find(payload, 'text/plain');
  if (plain) return decode(plain).replaceAll('\r\n', '\n').trim();
  const html = find(payload, 'text/html');
  return html ? htmlToText(decode(html)).trim() : '';
}

// « Julie Martin <julie@acme.fr> », « "Martin, Julie" <julie@acme.fr> » ou « julie@acme.fr ».
export function parseAddress(value: string | null): { name: string | null; email: string | null } {
  if (!value) return { name: null, email: null };
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
  if (!match)
    return value.includes('@')
      ? { name: null, email: value.trim() }
      : { name: value.trim(), email: null };
  const name = (match[1] ?? '').replace(/^"(.*)"$/, '$1').trim();
  return { name: name || null, email: (match[2] ?? '').trim() || null };
}

// Les adresses d'un en-tête To ou Cc, sans les noms : « "Martin, Julie" <julie@acme.fr>, paul@acme.fr »,
// ou un groupe (« Équipe: julie@acme.fr, paul@acme.fr; », « undisclosed-recipients:; »). Les noms entre
// guillemets et les commentaires entre parenthèses partent d'abord : ils peuvent contenir une virgule.
// Un guillemet ou une parenthèse jamais fermés (« Julie :( <julie@acme.fr> ») ne retirent qu'eux-mêmes : le
// texte qui suit reste. La fermeture est facultative dans l'expression pour le lire en une passe : sans cela,
// un en-tête piégé serait relu depuis chacun d'eux, en temps quadratique.
export function parseAddressList(value: string | null): string[] {
  return (value ?? '')
    .replace(
      /"((?:[^"\\]|\\.)*)("?)|\(([^()]*)(\)?)/g,
      (_whole, quoted = '', endQuote, comment = '', endComment) =>
        endQuote || endComment ? '' : quoted + comment,
    )
    .split(/[,;]/)
    .map((part) => (/<([^<>]*)>/.exec(part)?.[1] ?? part.replace(/^[^@<]*:/, '')).trim())
    .filter((address) => address.includes('@'));
}

// « RE : », « TR : », « FW : »… changent à chaque réponse : le titre du fil ne doit pas suivre.
const REPLY_PREFIX = /^(?:(?:re|tr|fw|fwd|rv|aw)\s*:\s*)+/i;
const titleOf = (subject: string | null): string =>
  (subject ?? '').replace(REPLY_PREFIX, '').trim() || 'Sans objet';

const iso = (internalDate: string) => new Date(Number(internalDate)).toISOString();

// Un message reçu envoyé par une machine ou en nombre, lu dans ce que Gmail rend déjà (format=full), sans modèle ni
// requête de plus : un en-tête de liste ou d'envoi automatique (List-Unsubscribe, List-Id, Auto-Submitted autre que
// « no », Precedence bulk, list ou junk), un onglet autre que Principale, ou une adresse d'expéditeur de machine. Les
// onglets, d'après leurs libellés (doc lue le 23/11/2026 :
// https://developers.google.com/workspace/gmail/api/guides/labels) : Notifications (CATEGORY_UPDATES) et Forums
// (CATEGORY_FORUMS) ; Promotions et Réseaux sociaux ne sont pas relevés (connector.ts). Rien n'en est gardé que ce fait.
const MACHINE_SENDER =
  /^(?:no-reply|noreply|do-not-reply|donotreply|mailer-daemon|postmaster|notifications)/i;
const BULK_TABS = ['CATEGORY_UPDATES', 'CATEGORY_FORUMS'];

function automated(message: GmailMessage, from: string | null): boolean {
  const header = (name: string) => headerOf(message.payload, name)?.trim().toLowerCase() ?? null;
  const submitted = header('auto-submitted');
  return (
    header('list-unsubscribe') !== null ||
    header('list-id') !== null ||
    (submitted !== null && !/^no\b/.test(submitted)) ||
    ['bulk', 'list', 'junk'].includes(header('precedence') ?? '') ||
    (message.labelIds ?? []).some((label) => BULK_TABS.includes(label)) ||
    MACHINE_SENDER.test(from ?? '')
  );
}

function messageTurn(message: GmailMessage): ConnectorTurn | null {
  const text = textOf(message.payload);
  if (text === '') return null;
  const author = parseAddress(headerOf(message.payload, 'from'));
  return {
    externalId: `message:${message.id}`,
    role: 'participant',
    author,
    // Envoyé depuis sa boîte : du côté de l'équipe. Reçu : envoyé par une machine ou en nombre, ou non.
    ...(message.labelIds?.includes('SENT')
      ? { side: 'team' as const }
      : { automated: automated(message, author.email) }),
    recipients: {
      to: parseAddressList(headerOf(message.payload, 'to')),
      cc: parseAddressList(headerOf(message.payload, 'cc')),
    },
    text,
    ts: iso(message.internalDate),
  };
}

// Un brouillon, un courrier indésirable ou une discussion Chat ne sont pas lus, même si la recherche
// les laisse passer.
const SKIPPED_LABELS = ['DRAFT', 'SPAM', 'TRASH', 'CHAT'];

type Entry = { message: GmailMessage; turn: ConnectorTurn };

// Les messages d'un lot, regroupés par fil, du fil le moins récemment animé au plus récent.
export function threadsOf(messages: GmailMessage[]): ConnectorItem[] {
  const threads = new Map<string, Entry[]>();
  for (const message of messages) {
    if (message.labelIds?.some((label) => SKIPPED_LABELS.includes(label))) continue;
    const turn = messageTurn(message);
    if (!turn) continue;
    threads.set(message.threadId, [...(threads.get(message.threadId) ?? []), { message, turn }]);
  }
  const items: ConnectorItem[] = [];
  for (const [threadId, entries] of threads) {
    entries.sort((a, b) => Date.parse(a.turn.ts) - Date.parse(b.turn.ts));
    const first = entries[0];
    const last = entries.at(-1);
    if (!first || !last) continue;
    items.push({
      externalId: `thread:${threadId}`,
      nature: 'fil',
      title: titleOf(headerOf(first.message.payload, 'subject')),
      // Le fil dans le premier compte Google ouvert du navigateur.
      url: `https://mail.google.com/mail/#all/${threadId}`,
      updatedAt: last.turn.ts,
      origin: {},
      turns: entries.map((entry) => entry.turn),
    });
  }
  return items.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}
