import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { safeErrorDetail } from './log';

const MASKED = '[masqué]';
const MAX_CAUSES = 10;

// Le message d'une erreur peut citer du texte de la mémoire : Sentry reçoit ce que log.ts écrit dans les journaux,
// pas plus. Chaque erreur de la chaîne `cause` est retrouvée par son nom et son message ; une valeur qu'on ne retrouve
// pas (rejet d'une valeur qui n'est pas une erreur) est masquée.
export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  const chain: Error[] = [];
  for (
    let e = hint.originalException;
    e instanceof Error && chain.length < MAX_CAUSES;
    e = e.cause
  ) {
    chain.push(e);
  }
  for (const exception of event.exception?.values ?? []) {
    const source = chain.find((e) => e.name === exception.type && e.message === exception.value);
    exception.value = source ? safeErrorDetail(source) : MASKED;
  }
  return event;
}
