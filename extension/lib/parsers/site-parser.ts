import type { CapturedExchange, RejectReason, Site } from '../exchange';

export type Rejection = { rejected: RejectReason };

// Un parseur par site capté : reconnaît la requête de complétion, puis lit l'échange terminé. Il rend l'échange, ou
// un rejet avec sa raison (sans contenu), ou null quand il n'y a rien à capter (une régénération, par exemple).
export type SiteParser = {
  site: Site;
  matchesRequest(url: URL, method: string): boolean;
  parse(input: {
    url: URL;
    requestBody: string | null;
    sseText: string;
    now: Date;
  }): Promise<CapturedExchange | Rejection | null>;
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
