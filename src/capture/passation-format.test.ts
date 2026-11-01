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

  it('reconnaît un tag décomposé (NFD) comme un tag normal', () => {
    expect(parseNote('- [de\u0301cision] x').items[0]?.type).toBe('decision');
    expect(parseNote('- [décision] x\n- conce\u0301rne [[D1]]').items[0]?.links[0]?.relation).toBe(
      'concérne',
    );
  });

  it('ignore un élément dont le texte est vide ou fait d’espaces', () => {
    expect(parseNote('- [décision]   \n- [question]').items).toEqual([]);
  });

  it('ne regarde que les premiers NOTE_MAX_CHARS et reste rapide sur un million d’espaces', () => {
    const text = `- [décision] a\n${' '.repeat(1_000_000)}\n- [décision] b`;
    const debut = Date.now();
    expect(parseNote(text).items).toHaveLength(1);
    expect(Date.now() - debut).toBeLessThan(500);
  });

  it('garde le premier résumé et ignore les suivants', () => {
    expect(parseNote('## Où j’en suis\nA\n\n## Où j’en suis\nB').resume).toBe('A');
  });

  it('décrit un numéro court', () => {
    expect(NUMERO_PATTERN.test('D12')).toBe(true);
    expect(NUMERO_PATTERN.test('X1')).toBe(false);
    expect(NUMERO_PATTERN.test('D0')).toBe(false);
  });
});
