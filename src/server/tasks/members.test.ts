import { describe, expect, it } from 'vitest';
import { firstNameOf, initialsOf } from './members';

describe('initialsOf', () => {
  it.each([
    ['Amos Koskas', 'AK'],
    ['Jean-Pierre Dupont', 'JD'],
    ['Marie de la Tour', 'MT'],
    ['Élodie Martin', 'ÉM'],
    ['  paul   martin ', 'PM'],
    ['Zoé', 'ZO'],
    ['X', 'X'],
    ['', '?'],
    ['   ', '?'],
  ])('%j → %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('firstNameOf', () => {
  it.each([
    ['Amos Koskas', 'Amos'],
    ['  Jean-Pierre   Dupont', 'Jean-Pierre'],
    ['Zoé', 'Zoé'],
    ['', ''],
  ])('%j → %j', (name, firstName) => {
    expect(firstNameOf(name)).toBe(firstName);
  });
});
