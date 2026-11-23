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

// Un appel suivi au fil de l'eau, dès l'envoi. La réponse : ses en-têtes et les morceaux d'octets de sa copie (une
// coupure ou une annulation finit la suite sans lever ; sortir de la boucle cesse de lire), ou null quand le site a
// refusé ou que l'appel a échoué. report rend un échange ou un rejet, à tout moment.
export type ObservedCall = {
  url: URL;
  request: { headers: Headers; body: Promise<Uint8Array<ArrayBuffer> | null> };
  response: Promise<{ headers: Headers; chunks: AsyncIterable<Uint8Array> } | null>;
  report(result: CapturedExchange | Rejection): void;
};

// Un parseur au fil de l'eau (claude.ai) : la réponse arrive sur un autre appel que l'envoi, par un flux qui peut
// rester ouvert sans fin. Il garde son état d'un appel à l'autre et rend ses résultats par report.
export type StreamParser = {
  site: Site;
  matchesRequest(url: URL, method: string): boolean;
  observe(call: ObservedCall): Promise<void>;
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
