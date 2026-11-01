import { describe, expect, it } from 'vitest';
import { NUMERO_PATTERN, parseNote } from './passation-format';

const NOTE = `## Où j'en suis
Refonte de l'auth : Better Auth branché,
reste la page de connexion.

- concerne [[dépôt leon]]
- [décision] On passe à Better Auth #auth
- remplace [[D12]]
- concerne [[PR #91]]
- [essai-raté] Pools 10+5 → EMAXCONNSESSION
- [prochaine-étape] Brancher /connexion
- [en-cours] Migration 0043 écrite
- [question] Faut-il garder les anciens jetons ?
- [idée] Une ligne au type inconnu
Une ligne libre.
`;

describe('parseNote', () => {
  it('lit le résumé sous « Où j’en suis », sur plusieurs lignes', () => {
    expect(parseNote(NOTE).resume).toBe(
      "Refonte de l'auth : Better Auth branché,\nreste la page de connexion.",
    );
  });

  it('lit les cinq types, accents ou non, et ignore les types inconnus', () => {
    expect(parseNote(NOTE).items.map((item) => [item.type, item.texte])).toEqual([
      ['decision', 'On passe à Better Auth #auth'],
      ['essai_rate', 'Pools 10+5 → EMAXCONNSESSION'],
      ['prochaine_etape', 'Brancher /connexion'],
      ['en_cours', 'Migration 0043 écrite'],
      ['question', 'Faut-il garder les anciens jetons ?'],
    ]);
    expect(
      parseNote('- [decision] a\n- [essai-rate] b\n- [prochaine-etape] c').items.map((i) => i.type),
    ).toEqual(['decision', 'essai_rate', 'prochaine_etape']);
  });

  it('rattache un lien au dernier élément, ou à la note avant tout élément', () => {
    const note = parseNote(NOTE);
    expect(note.noteLinks).toEqual([{ relation: 'concerne', cible: 'dépôt leon' }]);
    expect(note.items[0]?.links).toEqual([
      { relation: 'remplace', cible: 'D12' },
      { relation: 'concerne', cible: 'PR #91' },
    ]);
  });

  it('ne retient comme remplacement qu’un numéro bien formé rattaché à un élément', () => {
    const note = parseNote(
      '- remplace [[D3]]\n- [décision] x\n- remplace [[D12]]\n- remplace [[pas un numéro]]',
    );
    expect(note.items[0]?.remplace).toEqual(['D12']);
    expect(note.items[0]?.links).toHaveLength(2);
  });

  it('rend une note vide pour un texte sans format', () => {
    expect(parseNote('rien de structuré')).toEqual({ resume: null, items: [], noteLinks: [] });
  });

  it('accepte l’apostrophe typographique et un titre sans accent', () => {
    expect(parseNote('## Où j’en suis\nA').resume).toBe('A');
    expect(parseNote("## Ou j'en suis\nB").resume).toBe('B');
  });

  it('coupe un élément trop long', () => {
    const long = 'x'.repeat(3000);
    expect(parseNote(`- [décision] ${long}`).items[0]?.texte).toHaveLength(2000);
  });

  it('décrit un numéro court', () => {
    expect(NUMERO_PATTERN.test('D12')).toBe(true);
    expect(NUMERO_PATTERN.test('X1')).toBe(false);
    expect(NUMERO_PATTERN.test('D0')).toBe(false);
  });
});
