import { PAGE_SIZE } from './search-limits';

// Contrat de la réponse en tête (C8 du plan du deuxième jet) entre la route du serveur et l'encadré de la page
// de recherche. Le navigateur n'importe rien de `@/server` : la route, la phrase du « pas assez » et la lecture
// du flux vivent ici (avec les plafonds de search-limits.ts, qui n'importe rien).

// GET, cookie de session : 204 sans modèle, sinon un flux `text/event-stream` d'évènements JSON.
// `?q=` la requête, `&r=` les identifiants des sources affichées sur la page, dans leur ordre, séparés par des
// virgules : un renvoi [n] de la réponse désigne le n-ième. La route refait la recherche sous les droits du
// lecteur et n'en garde que ces sources ; la liste ne donne accès à rien d'autre.
export const ANSWER_PATH = '/api/v1/recherche/reponse';
export const ANSWER_RESULTS_PARAM = 'r';

// La phrase exacte que le modèle écrit quand les résultats ne suffisent pas (le prompt l'exige mot pour mot).
export const ANSWER_NOT_ENOUGH = 'Les résultats ne suffisent pas pour répondre.';

// « indisponible » termine le flux : le modèle (ou la recherche) a échoué, le texte déjà reçu ne vaut rien.
export type AnswerEvent =
  | { type: 'texte'; delta: string }
  | { type: 'fin' }
  | { type: 'indisponible' };

export function answerUrl(query: string, resultIds: readonly string[]): string {
  const params = new URLSearchParams({ q: query, [ANSWER_RESULTS_PARAM]: resultIds.join(',') });
  return `${ANSWER_PATH}?${params.toString()}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Les résultats de la page, en minuscules (comme la base les rend), ou null si la liste est absente, vide, plus
// longue qu'une page, mal écrite, ou nomme deux fois une source.
export function parseAnswerResults(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const ids = raw.toLowerCase().split(',');
  if (ids.length > PAGE_SIZE || new Set(ids).size !== ids.length) return null;
  return ids.every((id) => UUID.test(id)) ? ids : null;
}

// Un évènement du flux, ou null s'il n'est pas du contrat. Seuls ses champs connus sont gardés.
export function parseAnswerEvent(data: string): AnswerEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { type, delta } = value as { type?: unknown; delta?: unknown };
  if (type === 'texte') return typeof delta === 'string' ? { type, delta } : null;
  if (type === 'fin' || type === 'indisponible') return { type };
  return null;
}

// Lecture d'un flux d'évènements serveur (format `text/event-stream`) morceau par morceau : un évènement finit
// par une ligne vide, ses lignes `data:` se joignent ; les commentaires (`:`) et les autres champs sont ignorés.
export function createAnswerEventReader(): { push(chunk: string): AnswerEvent[] } {
  let buffer = '';
  return {
    push(chunk) {
      buffer = (buffer + chunk).replace(/\r\n?/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      const events: AnswerEvent[] = [];
      for (const block of blocks) {
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''));
        if (data.length === 0) continue;
        const event = parseAnswerEvent(data.join('\n'));
        if (event) events.push(event);
      }
      return events;
    },
  };
}
