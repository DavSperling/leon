// Contrat de la réponse en tête (C8 du plan du deuxième jet) entre la route du serveur et l'encadré de la page
// de recherche. Le navigateur n'importe rien de `@/server` : la route, la phrase du « pas assez » et la lecture
// du flux vivent ici, sans aucun import.

// GET, cookie de session : 204 sans modèle, sinon un flux `text/event-stream` d'évènements JSON.
export const ANSWER_PATH = '/api/v1/recherche/reponse';

// La phrase exacte que le modèle écrit quand les résultats ne suffisent pas (le prompt l'exige mot pour mot).
export const ANSWER_NOT_ENOUGH = 'Les résultats ne suffisent pas pour répondre.';

// « indisponible » termine le flux : le modèle (ou la recherche) a échoué, le texte déjà reçu ne vaut rien.
export type AnswerEvent =
  | { type: 'texte'; delta: string }
  | { type: 'fin' }
  | { type: 'indisponible' };

export function answerUrl(query: string): string {
  return `${ANSWER_PATH}?${new URLSearchParams({ q: query }).toString()}`;
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
