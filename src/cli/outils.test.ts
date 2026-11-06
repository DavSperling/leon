import { describe, expect, it } from 'vitest';
import { ADAPTATEURS } from './outils';

describe('ADAPTATEURS.codex.demarrage (C5)', () => {
  it('rend exactement la forme JSON que Codex attend, sans autre champ', () => {
    expect(
      JSON.parse(ADAPTATEURS.codex.demarrage('<contexte-leon>x</contexte-leon>')),
    ).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '<contexte-leon>x</contexte-leon>',
      },
    });
  });

  it('garde 8 000 octets accentués intacts, et ne demande jamais l’arrêt de la session', () => {
    const block = 'é’—'.repeat(8000 / 8).padEnd(8000 / 2, 'a');
    const output = ADAPTATEURS.codex.demarrage(block);
    expect(JSON.parse(output).hookSpecificOutput.additionalContext).toBe(block);
    expect(output).not.toContain('"continue"');
  });
});
