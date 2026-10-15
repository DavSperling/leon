import { describe, expect, it } from 'vitest';
import { pressedKey } from './picker';

describe('pressedKey', () => {
  it('lit le chiffre de la touche, même quand AZERTY donne un autre caractère', () => {
    expect(pressedKey({ key: '&', code: 'Digit1' })).toBe('1');
    expect(pressedKey({ key: 'à', code: 'Digit0' })).toBe('0');
  });

  it('lit le pavé numérique comme la rangée du haut', () => {
    expect(pressedKey({ key: '3', code: 'Numpad3' })).toBe('3');
  });

  it('garde le caractère des autres touches', () => {
    expect(pressedKey({ key: 'a', code: 'KeyQ' })).toBe('a');
    expect(pressedKey({ key: 'Enter', code: 'Enter' })).toBe('Enter');
  });
});
