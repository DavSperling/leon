import type { CapturedExchange, Site } from '../exchange';

// Un parseur par site capté : reconnaît la requête de complétion, puis lit l'échange terminé.
export type SiteParser = {
  site: Site;
  matchesRequest(url: URL, method: string): boolean;
  parse(input: {
    url: URL;
    requestBody: string | null;
    sseText: string;
    now: Date;
  }): Promise<CapturedExchange | null>;
};

// Corps de requête et données SSE viennent du site : un JSON illisible vaut absence, jamais une exception.
export function parseJsonOrNull(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
