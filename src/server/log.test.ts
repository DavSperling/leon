import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, safeErrorSummary } from './log';

function pgError() {
  return Object.assign(new Error('duplicate key value violates unique constraint (zanzibar)'), {
    name: 'error',
    code: '23505',
    constraint: 'turns_source_id_external_id_key',
    table: 'turns',
    severity: 'ERROR',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('safeErrorSummary', () => {
  it('donne le nom puis le message tronqué à 200 caractères', () => {
    const summary = safeErrorSummary(new Error('x'.repeat(300)));
    expect(summary).toBe(`Error: ${'x'.repeat(200)}`);
  });

  it("n'écrit ni le SQL ni les paramètres d'une DrizzleQueryError", () => {
    const error = new DrizzleQueryError('insert into turns …', ['zanzibar'], pgError());
    const summary = safeErrorSummary(error);
    expect(summary).toContain('23505');
    expect(summary).toContain('turns_source_id_external_id_key');
    expect(summary).toContain('turns');
    expect(summary).not.toContain('zanzibar');
    expect(summary).not.toContain('insert into');
  });

  it("n'écrit pas le message d'une erreur pg", () => {
    const summary = safeErrorSummary(pgError());
    expect(summary).toContain('23505');
    expect(summary).not.toContain('zanzibar');
  });

  it("n'écrit que le nom d'une erreur d'analyse JSON", () => {
    let error: unknown;
    try {
      JSON.parse('{"zanzibar');
    } catch (e) {
      error = e;
    }
    const summary = safeErrorSummary(error);
    expect(summary).toBe('SyntaxError');
  });

  it("décrit une valeur qui n'est pas une erreur sans la recopier", () => {
    expect(safeErrorSummary('zanzibar')).toBe('erreur inconnue');
  });
});

describe('logError', () => {
  it("écrit une seule ligne : l'événement, les ids et le résumé", () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('boum'), { detail: 'zanzibar', body: 'zanzibar' });
    logError('ingest.failed', error, { runId: 'run-1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [tag, event, json] = spy.mock.calls[0] as [string, string, string];
    expect(tag).toBe('[leon]');
    expect(event).toBe('ingest.failed');
    expect(JSON.parse(json)).toEqual({ runId: 'run-1', error: 'Error: boum' });
    expect(json).not.toContain('zanzibar');
  });
});
