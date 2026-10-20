import { describe, expect, it } from 'vitest';
import { messageSegments, toolActivityLabel } from './message-segments';

describe('messageSegments', () => {
  it('découpe le texte et les renvois aux citations connues, même éparses', () => {
    expect(messageSegments('Oui [1][3], pas [2].', new Set([1, 3]))).toEqual([
      { text: 'Oui ' },
      { ref: 1 },
      { ref: 3 },
      { text: ', pas .' },
    ]);
  });

  it('laisse un texte sans renvoi tel quel, retours à la ligne compris', () => {
    expect(messageSegments('Ligne 1\n\nLigne 2', new Set())).toEqual([
      { text: 'Ligne 1\n\nLigne 2' },
    ]);
  });

  // Audit 3 n° 9.
  it('laisse un indice de tableau dans le texte, sans le retirer ni le lire comme un renvoi', () => {
    expect(messageSegments('Voir [1] : argv[0], items[1][2] et f(x)[1].', new Set([1, 2]))).toEqual(
      [{ text: 'Voir ' }, { ref: 1 }, { text: ' : argv[0], items[1][2] et f(x)[1].' }],
    );
  });

  it('ne lit pas de HTML : une balise reste du texte', () => {
    expect(messageSegments('<b>[1]</b>', new Set([1]))).toEqual([
      { text: '<b>' },
      { ref: 1 },
      { text: '</b>' },
    ]);
  });
});

describe('toolActivityLabel', () => {
  it('dit ce que fait l’agent, pour chaque outil et pour un outil inconnu', () => {
    expect(toolActivityLabel('chercher')).toBe('Leon cherche dans la mémoire…');
    expect(toolActivityLabel('lire')).toBe('Leon lit une source…');
    expect(toolActivityLabel('activite')).toBe('Leon regarde l’activité récente…');
    expect(toolActivityLabel('autre')).toBe('Leon travaille…');
  });
});
