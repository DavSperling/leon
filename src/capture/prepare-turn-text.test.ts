import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from './mask-secrets';
import { prepareTurnText } from './prepare-turn-text';
import { TURN_TEXT_MAX } from './turn';

describe('prepareTurnText', () => {
  it('retire un bloc system-reminder multiligne', () => {
    const text = 'Avant.\n<system-reminder>\nligne 1\nligne 2\n</system-reminder>\nAprès.';
    expect(prepareTurnText(text)).toBe('Avant.\n\nAprès.');
  });

  it('masque les secrets', () => {
    expect(prepareTurnText('password=correct-horse-battery')).toBe(`password=${SECRET_MASK}`);
  });

  it('retire les espaces autour', () => {
    expect(prepareTurnText('  \n Bonjour \n ')).toBe('Bonjour');
  });

  it('tronque au-delà de TURN_TEXT_MAX en finissant par le marqueur', () => {
    const result = prepareTurnText('a '.repeat(25_000));
    expect(result).not.toBeNull();
    expect(result?.length).toBeLessThanOrEqual(TURN_TEXT_MAX);
    expect(result?.endsWith('[…tronqué]')).toBe(true);
  });

  it('laisse intact un texte de la longueur maximale', () => {
    const text = 'a'.repeat(TURN_TEXT_MAX);
    expect(prepareTurnText(text)).toBe(text);
  });

  it('renvoie null pour un texte vide ou fait d’espaces', () => {
    expect(prepareTurnText('   \n\t ')).toBeNull();
  });

  it('renvoie null pour un bloc system-reminder seul', () => {
    expect(prepareTurnText('<system-reminder>Rappel</system-reminder>')).toBeNull();
  });
});
