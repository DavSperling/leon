// Lecture d'un flux d'évènements serveur (format `text/event-stream`) morceau par morceau, partagée par la réponse
// en tête et la discussion : un évènement finit par une ligne vide, ses lignes `data:` se joignent ; les
// commentaires (`:`) et les autres champs sont ignorés. `parse` lit les données d'un évènement, ou rend null pour
// un évènement hors contrat, qui est écarté. Module pur, que le navigateur importe.
export function createEventStreamReader<T>(parse: (data: string) => T | null): {
  push(chunk: string): T[];
} {
  let buffer = '';
  return {
    push(chunk) {
      buffer = (buffer + chunk).replace(/\r\n?/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      const events: T[] = [];
      for (const block of blocks) {
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''));
        if (data.length === 0) continue;
        const event = parse(data.join('\n'));
        if (event !== null) events.push(event);
      }
      return events;
    },
  };
}
