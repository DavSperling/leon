import { describe, expect, it } from 'vitest';
import { renderBriefing, renderEmptyBriefing } from '@/server/briefing/briefing-prompt';
import { renderContext } from '@/server/sessions/render-context';
import { prepareTurnText } from './prepare-turn-text';
import { stripLeonBlocks } from './strip-leon-blocks';

// Le bloc de démarrage tel que le serveur le rend (C4 du plan mémoire des sessions), et non une copie : un en-tête ou
// une balise changés côté serveur font échouer ces tests au lieu de passer sans bruit.
const PROJECT = 'github.com/davsperling/leon';
const PREPARED_AT = new Date('2026-11-02T04:00:00.000Z');
const BRIEFING = renderBriefing({
  project: PROJECT,
  preparedAt: PREPARED_AT,
  body: '## Ce que tu as fait\n- Le jeton est corrigé.',
  references: [],
});
const START_BLOCK = renderContext({
  project: PROJECT,
  sessions: [{ kind: 'claude_code', lastTs: new Date('2026-11-01T17:02:00.000Z'), faits: null }],
  briefing: BRIEFING,
  max: 8000,
});

describe('stripLeonBlocks', () => {
  it('retire le bloc de démarrage et le point du matin, en-tête compris, et garde le texte autour', () => {
    expect(START_BLOCK).toContain('<contexte-leon>');
    expect(START_BLOCK).toContain('# Morning briefing · ');
    // Les sauts de ligne autour des blocs restent : prepareTurnText ne coupe que les bords.
    expect(stripLeonBlocks(`Avant\n${START_BLOCK}\nAprès`)).toBe('Avant\n\n\n\n\nAprès');
  });

  it('retire le point du matin d’un projet sans nouvelles, qui n’a pas de balise', () => {
    const empty = renderEmptyBriefing(PROJECT, PREPARED_AT, 14);

    expect(prepareTurnText(stripLeonBlocks(empty))).toBeNull();
    expect(stripLeonBlocks(`${empty}\nOn reprend ?`)).toBe('\nOn reprend ?');
  });

  it('retire le point du matin seul, que donne un serveur plus ancien', () => {
    expect(prepareTurnText(stripLeonBlocks(BRIEFING))).toBeNull();
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
