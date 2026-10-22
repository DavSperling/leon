import { expect, test } from 'vitest';
import { nb } from './nb';

test('espace fine insécable avant les deux-points et dans les guillemets', () => {
  expect(nb('Note : « oui »')).toBe('Note\u202f: «\u202foui\u202f»');
});

test('laisse intacts les deux-points sans espace (heures, adresses)', () => {
  expect(nb('14:12 https://x outil:github')).toBe('14:12 https://x outil:github');
});
