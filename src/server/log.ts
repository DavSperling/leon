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
  if (!(error instanceof Error)) return 'erreur inconnue';
  const head = [error.name, ...diagnostics(error)].join(' ');
  if (hidesMessage(error)) return head;
  return `${head}: ${error.message.slice(0, MESSAGE_MAX_CHARS)}`;
}

export function logError(event: string, error: unknown, ids: Record<string, string> = {}): void {
  console.error('[leon]', event, JSON.stringify({ ...ids, error: safeErrorSummary(error) }));
}
