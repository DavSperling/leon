import type * as Sentry from '@sentry/nextjs';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs';
import { safeErrorDetail } from './log';

// @sentry/nextjs ne ré-exporte pas ce type : on le lit dans les options du SDK.
export type StreamedSpan = Parameters<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSendSpan']>
>[0];

const MASKED = '[masqué]';
const MAX_CAUSES = 10;
// Un segment de chemin long et opaque est un jeton ou un identifiant : /invitation/<jeton>,
// /api/auth/reset-password/<jeton>, un UUID. dataCollection.urlQueryParams ne couvre que la requête, pas le chemin.
const OPAQUE_SEGMENT = /\/[A-Za-z0-9_-]{20,}(?=\/|$)/g;
// Où le SDK écrit l'adresse d'une requête : le contexte de trace, les attributs d'un span, un fil d'Ariane.
const URL_KEYS = ['url', 'url.full', 'url.path', 'http.url', 'http.target'];
// Seuls les fils d'Ariane des appels HTTP restent, sans leur requête : la console, les requêtes SQL et le reste
// pourraient citer de la mémoire.
const KEPT_BREADCRUMBS = new Set(['http', 'fetch']);

export const maskPath = (text: string): string => text.replace(OPAQUE_SEGMENT, `/${MASKED}`);
export const maskUrl = (url: string): string => maskPath(url.replace(/[?#].*$/, ''));

// Une valeur est une chaîne ou, pour un attribut de span, un objet { value }.
function maskEntries(
  data: Record<string, unknown> | undefined,
  keys: string[],
  mask: (text: string) => string,
): void {
  if (!data) return;
  for (const key of keys) {
    const entry = data[key];
    if (typeof entry === 'string') data[key] = mask(entry);
    else if (
      entry &&
      typeof entry === 'object' &&
      'value' in entry &&
      typeof entry.value === 'string'
    ) {
      entry.value = mask(entry.value);
    }
  }
}
const maskUrls = (data: Record<string, unknown> | undefined) =>
  maskEntries(data, URL_KEYS, maskUrl);

// Le message d'une erreur peut citer du texte de la mémoire : Sentry reçoit ce que log.ts écrit dans les journaux,
// pas plus. Chaque erreur de la chaîne `cause` est retrouvée par son nom et son message ; une valeur qu'on ne retrouve
// pas (rejet d'une valeur qui n'est pas une erreur) est masquée, et sa copie sérialisée est retirée.
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
  if (event.extra) delete event.extra.__serialized__;
  if (event.transaction) event.transaction = maskPath(event.transaction);
  if (event.request?.url) event.request.url = maskUrl(event.request.url);
  maskUrls(event.contexts?.trace?.data);
  return event;
}

// Le SDK 11 diffuse les spans (traceLifecycle 'stream', le défaut) : beforeSendTransaction n'est alors jamais appelé.
// Un span porte l'adresse de la requête (son nom, ses attributs) et celle de chaque appel sortant.
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = maskPath(span.name);
  maskUrls(span.attributes);
  // Le SDK répète le nom du segment dans un attribut.
  maskEntries(span.attributes, ['sentry.segment.name'], maskPath);
  return span;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!breadcrumb.category || !KEPT_BREADCRUMBS.has(breadcrumb.category)) return null;
  maskUrls(breadcrumb.data);
  return breadcrumb;
}
