import { describe, expect, it } from 'vitest';
import { startOutput } from './start-output';

// C5 du plan mémoire des sessions. Le bloc arrive du serveur déjà balisé et échappé : l'enveloppe n'y ajoute ni n'en
// retire rien.
describe('startOutput', () => {
  it('rend à Claude Code le bloc tel quel, accents, lignes et balises compris', () => {
    const block = [
      '<contexte-leon>',
      '## Mes dernières sessions sur github.com/acme/leon',
      '- 02/11 14:10 · Claude Code · branche amos/étude · PR #110',
      '</contexte-leon>',
      '<point-du-matin>',
      '# Point du matin · leon',
      '</point-du-matin>',
    ].join('\n');

    expect(startOutput('claude_code', block)).toBe(block);
  });

  it('rend à Codex le bloc dans la forme JSON de son crochet', () => {
    expect(JSON.parse(startOutput('codex', 'Bloc'))).toEqual({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Bloc' },
    });
  });
});
