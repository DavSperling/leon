import { describe, expect, it, vi } from 'vitest';
import {
  createNoteSender,
  currentBranch,
  fetchLastNoteAt,
  fetchPassationState,
  isFallbackRun,
  joinStartOutput,
  SUMMARY_PROMPT,
  shouldSummarize,
  summarizeAndSend,
} from './passation';

const server = { url: 'https://leon.test', token: `leon_${'a'.repeat(43)}` };
const asFetch = (fn: unknown) => fn as typeof fetch;

describe('currentBranch', () => {
  it('rend la branche, ou null hors d’une branche', async () => {
    expect(await currentBranch('/repo', async () => 'auth\n')).toBe('auth');
    expect(await currentBranch('/repo', async () => '')).toBeNull();
    expect(await currentBranch('/repo', async () => null)).toBeNull();
  });
});

describe('fetchPassationState', () => {
  it('rend le markdown, ou null au moindre problème', async () => {
    const ok = vi.fn(async (_url: URL) => Response.json({ markdown: '# Passation' }));
    expect(await fetchPassationState(asFetch(ok), server, 'github.com/a/b', 'auth')).toBe(
      '# Passation',
    );
    const url = new URL(String(ok.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/passation');
    expect(url.searchParams.get('projet')).toBe('github.com/a/b');
    expect(url.searchParams.get('branche')).toBe('auth');
    expect(
      await fetchPassationState(
        asFetch(async () => Response.json({ markdown: null })),
        server,
        'p',
        null,
      ),
    ).toBeNull();
    expect(
      await fetchPassationState(
        asFetch(async () => new Response('', { status: 500 })),
        server,
        'p',
        null,
      ),
    ).toBeNull();
    const fails = async () => {
      throw new Error('réseau');
    };
    expect(await fetchPassationState(asFetch(fails), server, 'p', null)).toBeNull();
  });
});

describe('fetchLastNoteAt', () => {
  it('rend la date, null sans note, undefined quand on ne sait pas', async () => {
    const at = '2026-11-01T10:00:00.000Z';
    const ok = vi.fn(async (_url: URL) => Response.json({ at }));
    expect((await fetchLastNoteAt(asFetch(ok), server, 'p', 'auth'))?.toISOString()).toBe(at);
    expect(new URL(String(ok.mock.calls[0]?.[0])).pathname).toBe('/api/v1/passation/derniere');
    expect(
      await fetchLastNoteAt(
        asFetch(async () => Response.json({ at: null })),
        server,
        'p',
        null,
      ),
    ).toBeNull();
    expect(
      await fetchLastNoteAt(
        asFetch(async () => new Response('', { status: 401 })),
        server,
        'p',
        null,
      ),
    ).toBeUndefined();
  });
});

describe('joinStartOutput', () => {
  it('met l’état en premier et coupe le point pour rester sous la limite', () => {
    const out = joinStartOutput('E'.repeat(100), 'B'.repeat(500), 300);
    expect(out.startsWith('E'.repeat(100))).toBe(true);
    expect(out.length).toBeLessThanOrEqual(300);
    const lines = joinStartOutput('E', `B1\n${'B'.repeat(50)}`, 20);
    expect(lines).toBe('E\n\nB1');
    expect(joinStartOutput(null, 'B', 300)).toBe('B');
    expect(joinStartOutput('E', null, 300)).toBe('E');
  });
});

describe('shouldSummarize', () => {
  const startedAt = new Date('2026-11-01T09:00:00Z');
  it('ne résume pas une session courte ou déjà couverte par une note', () => {
    expect(shouldSummarize({ exchanges: 5, startedAt, lastNoteAt: null })).toBe(false);
    expect(
      shouldSummarize({ exchanges: 6, startedAt, lastNoteAt: new Date('2026-11-01T10:00:00Z') }),
    ).toBe(false);
    expect(
      shouldSummarize({ exchanges: 6, startedAt, lastNoteAt: new Date('2026-10-31T10:00:00Z') }),
    ).toBe(true);
    expect(shouldSummarize({ exchanges: 6, startedAt, lastNoteAt: null })).toBe(true);
  });
});

describe('isFallbackRun', () => {
  it('reconnaît le processus lancé par le secours', () => {
    expect(isFallbackRun({ LEON_PASSATION: '1' })).toBe(true);
    expect(isFallbackRun({})).toBe(false);
  });
});

describe('summarizeAndSend', () => {
  it('envoie la note produite si elle contient au moins une ligne au format', async () => {
    const send = vi.fn(async () => true);
    const sent = await summarizeAndSend({
      condensed: 'Utilisateur : x',
      runClaude: async (prompt, input) => {
        expect(prompt).toBe(SUMMARY_PROMPT);
        expect(input).toBe('Utilisateur : x');
        return "## Où j'en suis\nOK\n\n- [décision] Y";
      },
      send,
    });
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith("## Où j'en suis\nOK\n\n- [décision] Y");
  });

  it('n’envoie rien si la sortie n’a aucune ligne au format ou si claude échoue', async () => {
    const send = vi.fn(async () => true);
    expect(await summarizeAndSend({ condensed: 'x', runClaude: async () => 'Bonjour', send })).toBe(
      false,
    );
    expect(await summarizeAndSend({ condensed: 'x', runClaude: async () => null, send })).toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createNoteSender', () => {
  it('poste la note au contrat de la route, en claude_code', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }));
    expect(
      await createNoteSender(
        asFetch(fetchImpl),
        server,
        'github.com/a/b',
        'auth',
      )('- [décision] Y'),
    ).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/passation');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      texte: '- [décision] Y',
      projet: 'github.com/a/b',
      branche: 'auth',
      outil: 'claude_code',
    });
    const fails = async () => {
      throw new Error('réseau');
    };
    expect(await createNoteSender(asFetch(fails), server, 'p', null)('x')).toBe(false);
  });
});
