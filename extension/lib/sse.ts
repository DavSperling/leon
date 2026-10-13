export type SseEvent = { event: string | null; data: string };

// Lecture d'un flux Server-Sent Events complet (format WHATWG) : seuls les champs event et data servent.
export function parseSseText(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  let event: string | null = null;
  let data: string[] = [];
  const dispatch = () => {
    if (data.length > 0) events.push({ event, data: data.join('\n') });
    event = null;
    data = [];
  };
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line === '') {
      dispatch();
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  dispatch();
  return events;
}
