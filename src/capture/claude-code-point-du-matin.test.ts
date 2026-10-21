import { describe, expect, it } from 'vitest';
import { renderBriefing } from '@/server/briefing/briefing-prompt';
import { parseClaudeCodeSession } from './claude-code';

// Le point du matin que le crochet SessionStart injecte (T13) ne doit pas revenir dans la mémoire quand la session
// est captée : c'est une donnée dérivée (faite, entre autres, de ce qui mentionne l'utilisateur), pas un tour de la
// conversation, et il nourrirait le point suivant. La doc des crochets (https://code.claude.com/docs/en/hooks, lue
// le 2026-10-20) dit que le texte injecté est « enveloppé dans un rappel système » (<system-reminder>) et gardé dans
// le fichier de session, sans en donner la forme exacte. Les vraies sessions ne se lisent pas (vie privée) : ce test
// prend, sur un fichier FICTIF, les formes plausibles de cette ligne. Le format réel est à constater lors de l'essai
// manuel (T31), sur une session qui n'est pas celle d'un client.

const SESSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const POINT = renderBriefing({
  project: 'github.com/acme/leon',
  preparedAt: new Date('2026-10-20T04:00:00.000Z'),
  body: '## Ce que tu as fait\n- Le jeton est corrigé [1].\n## Ce qui a bougé\n- Julie attend ta revue [2].',
  references: [],
});
const INJECTED = `SessionStart:startup hook success: ${POINT}`;
const REMINDER = `<system-reminder>\n${INJECTED}\n</system-reminder>`;

let n = 0;
const entry = (fields: Record<string, unknown>) =>
  JSON.stringify({
    uuid: `dddddddd-dddd-4ddd-8ddd-${String(++n).padStart(12, '0')}`,
    sessionId: SESSION,
    timestamp: `2026-10-20T07:00:${String(n).padStart(2, '0')}.000Z`,
    cwd: '/projets/leon',
    ...fields,
  });

describe('parseClaudeCodeSession et le point du matin injecté au démarrage', () => {
  it('ne garde aucune des formes plausibles de la ligne du crochet, et garde la conversation', () => {
    const file = [
      // Une ligne à part, d'un type qui n'est pas un message.
      entry({
        type: 'attachment',
        attachment: {
          type: 'hook_additional_context',
          hookName: 'SessionStart:startup',
          content: [INJECTED],
        },
      }),
      entry({ type: 'system', subtype: 'informational', content: INJECTED }),
      // Un message utilisateur marqué « méta », en chaîne ou en blocs.
      entry({ type: 'user', isMeta: true, message: { role: 'user', content: REMINDER } }),
      entry({
        type: 'user',
        isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: REMINDER }] },
      }),
      // Un message utilisateur non marqué, mais tout entier dans un rappel système.
      entry({ type: 'user', message: { role: 'user', content: REMINDER } }),
      entry({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: REMINDER }] },
      }),
      // La conversation elle-même.
      entry({ type: 'user', message: { role: 'user', content: 'Reprends le test du jeton.' } }),
      entry({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Le test passe.' }] },
      }),
    ].join('\n');

    const session = parseClaudeCodeSession(file);

    expect(POINT).toMatch(/^# Point du matin · github\.com\/acme\/leon\n/);
    expect(session?.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ['user', 'Reprends le test du jeton.'],
      ['assistant', 'Le test passe.'],
    ]);
    expect(JSON.stringify(session)).not.toContain('Point du matin');
    expect(session?.title).toBe('Reprends le test du jeton.');
  });
});
