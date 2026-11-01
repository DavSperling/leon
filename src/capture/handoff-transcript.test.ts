import { describe, expect, it } from 'vitest';
import { condenseSession } from './handoff-transcript';

const line = (value: unknown) => JSON.stringify(value);
const JSONL = [
  line({
    type: 'user',
    timestamp: '2026-11-01T09:00:00.000Z',
    message: { content: 'Corrige les pools' },
  }),
  line({
    type: 'assistant',
    timestamp: '2026-11-01T09:01:00.000Z',
    message: {
      content: [
        { type: 'text', text: 'Je lance les tests.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test\necho fin' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/db.ts' } },
        { type: 'tool_use', name: 'Read', input: { file_path: '/repo/README.md' } },
      ],
    },
  }),
  line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
  line({ type: 'user', isSidechain: true, message: { content: 'sous-agent' } }),
  line({ type: 'user', isMeta: true, message: { content: 'méta' } }),
  'pas du json',
  'null',
  line({
    type: 'user',
    timestamp: '2026-11-01T09:05:00.000Z',
    message: { content: [{ type: 'text', text: 'Merci' }] },
  }),
].join('\n');

describe('condenseSession', () => {
  it('garde les textes, une ligne par commande et par fichier écrit, et compte les échanges', () => {
    const result = condenseSession(JSONL);
    expect(result.text).toBe(
      [
        'Utilisateur : Corrige les pools',
        'Assistant : Je lance les tests.',
        '$ pnpm test',
        '✎ /repo/src/db.ts',
        'Utilisateur : Merci',
      ].join('\n'),
    );
    expect(result.exchanges).toBe(2);
    expect(result.startedAt?.toISOString()).toBe('2026-11-01T09:00:00.000Z');
  });

  it('masque les secrets et garde la fin quand c’est trop long', () => {
    const secret = `sk-ant-api03-${'a'.repeat(90)}`;
    const long = [
      line({ type: 'user', message: { content: `clé ${secret}` } }),
      line({ type: 'user', message: { content: 'x'.repeat(200) } }),
    ].join('\n');
    const result = condenseSession(long, 100);
    expect(result.text).not.toContain(secret);
    expect(result.text.length).toBeLessThanOrEqual(100);
    expect(result.text.endsWith('x')).toBe(true);
    expect(condenseSession(long).text).toContain('clé [secret masqué]');
  });
});
