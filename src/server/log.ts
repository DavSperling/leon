import * as Sentry from '@sentry/nextjs';
import { DrizzleQueryError } from 'drizzle-orm';

const MESSAGE_MAX_CHARS = 200;
const DIAGNOSTIC_FIELDS = ['code', 'constraint', 'table'] as const;

// Le message d'une erreur de base (SQL et paramètres), d'une erreur pg ou d'une analyse JSON
// peut citer du texte de conversation : on n'en garde que le nom et les champs de diagnostic.
function hidesMessage(error: Error): boolean {
  const { code } = error as { code?: unknown };
  const isPgError = typeof code === 'string' && code.length === 5 && 'severity' in error;
  return error instanceof DrizzleQueryError || isPgError || error instanceof SyntaxError;
}

function diagnostics(error: Error): string[] {
  const sources = [error, error.cause].filter((s): s is Record<string, unknown> => !!s);
  return DIAGNOSTIC_FIELDS.flatMap((field) => {
    const value = sources.map((source) => source[field]).find((v) => typeof v === 'string');
    return value ? [`${field}=${value}`] : [];
  });
}

export function safeErrorSummary(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const head = [error.name, ...diagnostics(error)].join(' ');
  if (hidesMessage(error)) return head;
  return `${head}: ${error.message.slice(0, MESSAGE_MAX_CHARS)}`;
}

// Ce que Sentry reçoit à la place du message : les champs de diagnostic, plus le message quand il est sûr.
export function safeErrorDetail(error: Error): string {
  const parts = diagnostics(error);
  if (!hidesMessage(error)) parts.push(error.message.slice(0, MESSAGE_MAX_CHARS));
  return parts.join(' ');
}

export function logError(event: string, error: unknown, ids: Record<string, string> = {}): void {
  console.error('[leon]', event, JSON.stringify({ ...ids, error: safeErrorSummary(error) }));
  // Les ids sont des identifiants (run, source…), jamais du texte ; le message est masqué par scrubEvent.
  Sentry.captureException(error, { tags: { event }, extra: ids });
}
