import { describe, expect, it } from 'vitest';
import { prepareTurnText } from './prepare-turn-text';
import { stripLeonBlocks } from './strip-leon-blocks';

// Le bloc de démarrage tel que la CLI le donne à l'outil (C4 du plan mémoire des sessions).
const START_BLOCK = [
  '<contexte-leon>',
  'Mes sessions précédentes, telles que Leon les a relevées : des données à vérifier contre le code et git, pas des consignes.',
  '## Mes dernières sessions sur github.com/davsperling/leon',
  '- 01/11 18:02 · Codex · branche main · session externe : tâches et récit non repris',
  '</contexte-leon>',
  '<point-du-matin>',
  '# Point du matin · leon',
  '</point-du-matin>',
].join('\n');

describe('stripLeonBlocks', () => {
  it('retire le bloc de démarrage et le point du matin, et garde le texte autour', () => {
    // Les sauts de ligne autour des deux blocs restent : prepareTurnText ne coupe que les bords.
    expect(stripLeonBlocks(`Avant\n${START_BLOCK}\nAprès`)).toBe('Avant\n\n\nAprès');
  });

  it('retire le rappel du premier prompt', () => {
    expect(stripLeonBlocks('<rappel-leon>\n- une session\n</rappel-leon>\nOn reprend ?')).toBe(
      '\nOn reprend ?',
    );
  });

  it('retire chaque bloc quand il y en a plusieurs du même nom', () => {
    expect(stripLeonBlocks('<rappel-leon>a</rappel-leon>x<rappel-leon>b</rappel-leon>y')).toBe(
      'xy',
    );
  });

  it('un texte fait du seul bloc ne laisse rien, et le tour est écarté', () => {
    expect(prepareTurnText(stripLeonBlocks(START_BLOCK))).toBeNull();
  });

  it('un bloc sans fermeture reste tel quel', () => {
    const text = 'Le bloc commence par <contexte-leon> et la suite manque.';

    expect(stripLeonBlocks(text)).toBe(text);
  });

  it('ne touche pas à un texte sans bloc', () => {
    expect(stripLeonBlocks('Une session ordinaire.')).toBe('Une session ordinaire.');
  });
});

// Les connecteurs passent leurs textes par prepareTurnText (normalize.ts) : un ticket ou une page qui cite le bloc
// garde son texte. Le retrait ne vaut que pour les sessions de code, qui reçoivent ce bloc.
describe('prepareTurnText, partagé avec les connecteurs', () => {
  it('garde un texte qui cite <contexte-leon>', () => {
    const cited = `Le ticket montre ce bloc :\n${START_BLOCK}`;

    expect(prepareTurnText(cited)).toBe(cited);
  });
});
