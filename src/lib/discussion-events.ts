import { createEventStreamReader } from './event-stream';

// Contrat de la discussion (C8 et C9 du plan du deuxième jet) entre la route du serveur et la page d'une
// discussion. Le navigateur n'importe rien de `@/server` : la route, les évènements, les citations et les phrases
// fixes de fin de réponse vivent ici.

// POST, cookie de session, corps JSON `{ message }` : 204 sans modèle, 404 pour une discussion invisible ou
// inconnue, 429 au-delà de deux réponses en cours, sinon un flux `text/event-stream` d'évènements JSON.
export const DISCUSSIONS_PATH = '/api/v1/discussions';

// Durée maximale d'une réponse : au-delà, le serveur l'interrompt. La page qui attend une réponse commencée plus
// tôt (« en-cours ») n'attend pas plus longtemps.
export const DISCUSSION_TIMEOUT_MS = 180_000;

export function discussionMessagesUrl(discussionId: string): string {
  return `${DISCUSSIONS_PATH}/${encodeURIComponent(discussionId)}/messages`;
}

// 429 : l'utilisateur a déjà deux réponses en cours (le coût d'un utilisateur). Rien n'est écrit ; la route rend
// ce message, que la page affiche.
export const DISCUSSION_TOO_MANY =
  'Leon répond déjà à deux de vos questions. Attendez qu’une réponse soit finie, puis réessayez.';

// Longueur maximale d'un message de l'utilisateur.
export const DISCUSSION_MESSAGE_MAX_CHARS = 4000;

// Un renvoi [n] d'une réponse : la source et le passage qui le prouvent (C9). Sur la question qui ouvre une
// discussion depuis la barre, les résultats d'où elle part.
export type DiscussionCitation = {
  n: number;
  sourceId: string;
  passageId: string;
  title: string | null;
  url: string | null;
};

// 'fini' : le modèle a répondu ; 'limite' : le nombre d'étapes ou la longueur est atteint ; 'refus' : il a refusé.
export type DiscussionEndReason = 'fini' | 'limite' | 'refus';

// « indisponible » termine le flux : le modèle (ou la recherche, ou la base) a échoué, rien n'est gardé de la
// réponse ; `questionGardee` dit si la question est restée dans la discussion (elle peut alors être reposée).
// Faux quand elle n'a pas pu être écrite. « citations » arrive juste avant « fin ». « en-cours »
// est le seul évènement du flux quand Leon répond déjà dans cette discussion (une page quittée puis rouverte, un
// second onglet) : rien n'est écrit, ni la question ni une réponse, et la page relit la discussion jusqu'à ce que
// cette réponse y soit.
export type DiscussionEvent =
  | { type: 'texte'; delta: string }
  | { type: 'outil'; name: string }
  | { type: 'citations'; items: DiscussionCitation[] }
  | { type: 'fin'; reason: DiscussionEndReason }
  | { type: 'indisponible'; questionGardee: boolean }
  | { type: 'en-cours' };

// Phrases fixes que le serveur garde et que la page affiche à la fin d'une réponse (finalReplyText).
export const DISCUSSION_REFUSAL = 'Je ne peux pas répondre à cette demande.';
export const DISCUSSION_LIMIT_NOTE =
  'Je me suis arrêté avant la fin : la limite de recherches et de lectures pour une réponse est atteinte. Posez une question plus précise pour que je continue.';
export const DISCUSSION_EMPTY = 'Je ne sais pas : je n’ai rien trouvé à répondre.';

// Le texte de la réponse une fois le flux fini : ce que le serveur garde et ce que la page affiche. Un refus
// remplace le texte déjà reçu (il peut être partiel) ; une limite atteinte s'ajoute à ce qui est écrit.
export function finalReplyText(streamed: string, reason: DiscussionEndReason): string {
  if (reason === 'refus') return DISCUSSION_REFUSAL;
  const text = streamed.trim();
  if (reason === 'limite')
    return text === '' ? DISCUSSION_LIMIT_NOTE : `${text}\n\n${DISCUSSION_LIMIT_NOTE}`;
  return text === '' ? DISCUSSION_EMPTY : text;
}

const END_REASONS: readonly string[] = ['fini', 'limite', 'refus'] satisfies DiscussionEndReason[];

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

// Le lien d'une citation finit dans un `href` : seuls http et https passent, comme côté serveur (safeUrl de la
// recherche). Un autre lien est retiré, la citation reste.
function linkOf(url: string | null): string | null {
  if (url === null || url.length > 2000) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

// Une citation du contrat, avec ses seuls champs connus, ou null.
function parseCitation(value: unknown): DiscussionCitation | null {
  if (typeof value !== 'object' || value === null) return null;
  const { n, sourceId, passageId, title, url } = value as Record<string, unknown>;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  if (typeof sourceId !== 'string' || typeof passageId !== 'string') return null;
  if (!isNullableString(title) || !isNullableString(url)) return null;
  return { n, sourceId, passageId, title, url: linkOf(url) };
}

// Un évènement du flux, ou null s'il n'est pas du contrat. Seuls ses champs connus sont gardés.
export function parseDiscussionEvent(data: string): DiscussionEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { type, delta, name, items, reason, questionGardee } = value as Record<string, unknown>;
  if (type === 'texte') return typeof delta === 'string' ? { type, delta } : null;
  if (type === 'outil') return typeof name === 'string' ? { type, name } : null;
  if (type === 'citations') {
    return Array.isArray(items) ? { type, items: parseDiscussionCitations(items) } : null;
  }
  if (type === 'fin') {
    return typeof reason === 'string' && END_REASONS.includes(reason)
      ? { type, reason: reason as DiscussionEndReason }
      : null;
  }
  if (type === 'indisponible') return { type, questionGardee: questionGardee === true };
  if (type === 'en-cours') return { type };
  return null;
}

// Les citations du contrat parmi `value` (une colonne jsonb, un évènement) ; le reste est écarté.
export function parseDiscussionCitations(value: unknown): DiscussionCitation[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseCitation).filter((item): item is DiscussionCitation => item !== null);
}

// Lecture du flux de la route, morceau par morceau (event-stream.ts).
export function createDiscussionEventReader(): { push(chunk: string): DiscussionEvent[] } {
  return createEventStreamReader(parseDiscussionEvent);
}
