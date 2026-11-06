import type { ErrorEvent } from '@sentry/nextjs';
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry-scrub';

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
});
