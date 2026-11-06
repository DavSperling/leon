import type { ErrorEvent } from '@sentry/nextjs';
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { type StreamedSpan, scrubBreadcrumb, scrubEvent, scrubSpan } from './sentry-scrub';

// Un jeton d'invitation ou de réinitialisation : long, opaque.
const TOKEN = 'aB3dE5fG7hJ9kL1mN3pQ5rS7';

function pgError() {
  return Object.assign(new Error('duplicate key value (zanzibar)'), {
    name: 'error',
    code: '23505',
    constraint: 'turns_pkey',
    table: 'turns',
    severity: 'ERROR',
  });
}

// L'évènement que Sentry bâtit pour une erreur : une valeur par erreur de la chaîne `cause`.
function eventFor(...errors: Error[]): ErrorEvent {
  return {
    type: undefined,
    exception: { values: errors.map((e) => ({ type: e.name, value: e.message })) },
  };
}

describe('scrubEvent', () => {
  it('garde le message d’une erreur ordinaire', () => {
    const error = new Error('boum');
    const event = scrubEvent(eventFor(error), { originalException: error });
    expect(event.exception?.values?.[0]?.value).toBe('boum');
  });

  it('retire le SQL et les paramètres, sur toute la chaîne de causes', () => {
    const cause = pgError();
    const error = new DrizzleQueryError('insert into turns … zanzibar', ['zanzibar'], cause);
    const event = scrubEvent(eventFor(cause, error), { originalException: error });
    const values = event.exception?.values?.map((v) => v.value) ?? [];
    expect(values.join(' ')).toContain('23505');
    expect(values.join(' ')).not.toContain('zanzibar');
    expect(values.join(' ')).not.toContain('insert into');
  });

  it("masque une valeur qui n'est pas une erreur", () => {
    const event = scrubEvent(
      { type: undefined, exception: { values: [{ type: 'Error', value: 'zanzibar' }] } },
      { originalException: 'zanzibar' },
    );
    expect(event.exception?.values?.[0]?.value).toBe('[masqué]');
  });

  it('retire la copie sérialisée d’une valeur qui n’est pas une erreur', () => {
    const event = scrubEvent(
      { type: undefined, extra: { __serialized__: { texte: 'zanzibar' }, runId: 'run-1' } },
      { originalException: { texte: 'zanzibar' } },
    );
    expect(event.extra).toEqual({ runId: 'run-1' });
  });

  it('masque le jeton du chemin et coupe la requête de l’adresse', () => {
    const event = scrubEvent(
      {
        type: undefined,
        request: { url: `https://leonmemory.com/invitation/${TOKEN}?code=zanzibar` },
        contexts: {
          trace: { trace_id: 't', span_id: 's', data: { 'url.path': `/invitation/${TOKEN}` } },
        },
      },
      {},
    );
    expect(event.request?.url).toBe('https://leonmemory.com/invitation/[masqué]');
    expect(event.contexts?.trace?.data?.['url.path']).toBe('/invitation/[masqué]');
  });
});

describe('scrubSpan', () => {
  const span = (name: string, attributes: StreamedSpan['attributes'] = {}): StreamedSpan => ({
    trace_id: 't',
    span_id: 's',
    name,
    start_timestamp: 0,
    end_timestamp: 1,
    status: 'ok',
    is_segment: true,
    attributes,
  });

  it('masque le jeton du nom et des attributs, valeur brute ou { value }', () => {
    const scrubbed = scrubSpan(
      span(`GET /invitation/${TOKEN}`, {
        'url.full': `https://x/y/${TOKEN}?zanzibar=1`,
        'http.target': { value: `/invitation/${TOKEN}?a=b` },
        'http.method': 'GET',
        'sentry.segment.name': { value: `GET /invitation/${TOKEN}` },
      }),
    );
    expect(scrubbed.attributes['sentry.segment.name']).toEqual({
      value: 'GET /invitation/[masqué]',
    });
    expect(scrubbed.name).toBe('GET /invitation/[masqué]');
    expect(scrubbed.attributes['url.full']).toBe('https://x/y/[masqué]');
    expect(scrubbed.attributes['http.target']).toEqual({ value: '/invitation/[masqué]' });
    expect(scrubbed.attributes['http.method']).toBe('GET');
  });

  it('laisse intact un span sans attributs ni jeton', () => {
    expect(scrubSpan(span('GET /api/threads')).name).toBe('GET /api/threads');
  });
});

describe('scrubBreadcrumb', () => {
  it('retire la console et les autres catégories', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'zanzibar' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'query', message: 'select … zanzibar' })).toBeNull();
    expect(scrubBreadcrumb({ message: 'sans catégorie' })).toBeNull();
  });

  it('garde un appel HTTP sans jeton ni requête', () => {
    const kept = scrubBreadcrumb({ category: 'http', data: { url: `https://x/y/${TOKEN}?a=b` } });
    expect(kept?.data?.url).toBe('https://x/y/[masqué]');
  });
});
