import { describe, expect, it } from 'vitest';
import { chunkText } from './chunk';

// Marqueurs de surlignage (C6) : posés par ts_headline, ils ne doivent jamais entrer dans un passage.
const START = '\uE000';
const END = '\uE001';
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// Des mots et des fins de phrase (« . ») partout, sans fin de paragraphe : `length` caractères exactement.
function prose(length: number): string {
  const sentence = 'Le contrat OVH a été renouvelé pour un an par Julie. ';
  return sentence.repeat(Math.ceil(length / sentence.length) + 1).slice(0, length);
}

// Des mots séparés par des espaces, sans ponctuation.
function words(length: number): string {
  return 'budget '.repeat(Math.ceil(length / 7) + 1).slice(0, length);
}

describe('chunkText', () => {
  it('ne rend aucun passage pour un texte vide', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('rend un seul passage pour un texte court', () => {
    expect(chunkText('court')).toEqual([{ ord: 0, text: 'court', start: 0, end: 5 }]);
  });

  it('ne rend aucun passage pour un texte fait seulement d’espaces ou de marqueurs', () => {
    expect(chunkText('  \n\t ')).toEqual([]);
    expect(chunkText(`${START}${END}`)).toEqual([]);
  });

  it('retire les marqueurs de surlignage du texte, sans changer les positions', () => {
    expect(chunkText(`a${START}b${END}c`)).toEqual([{ ord: 0, text: 'abc', start: 0, end: 5 }]);
  });

  describe('un texte de 10 000 caractères en paragraphes de 500', () => {
    const paragraph = `${prose(498)}\n\n`;
    const source = paragraph.repeat(20);
    const passages = chunkText(source);

    it('fait 10 000 caractères (le jeu d’essai est juste)', () => {
      expect(source).toHaveLength(10_000);
    });

    it('couvre tout le texte, dans l’ordre', () => {
      expect(passages.map((passage) => passage.ord)).toEqual(passages.map((_, index) => index));
      expect(passages[0]?.start).toBe(0);
      expect(passages.at(-1)?.end).toBe(source.length);
    });

    it('chaque passage fait au plus 1 600 caractères, et au moins 1 000 sauf le dernier', () => {
      for (const [index, passage] of passages.entries()) {
        expect(passage.end - passage.start).toBeLessThanOrEqual(1600);
        expect(passage.text.length).toBeLessThanOrEqual(1600);
        if (index < passages.length - 1) {
          expect(passage.end - passage.start).toBeGreaterThanOrEqual(1000);
        }
      }
    });

    it('le texte d’un passage est la tranche du texte source', () => {
      for (const passage of passages) {
        expect(passage.text).toBe(source.slice(passage.start, passage.end));
      }
    });

    it('deux passages voisins se chevauchent de 1 à 150 caractères', () => {
      for (const [index, next] of passages.slice(1).entries()) {
        const previous = passages[index];
        if (!previous) throw new Error('passage précédent manquant');
        const overlap = previous.end - next.start;
        expect(overlap).toBeGreaterThanOrEqual(1);
        expect(overlap).toBeLessThanOrEqual(150);
      }
    });

    it('chaque coupe tombe juste après une fin de paragraphe', () => {
      for (const passage of passages.slice(0, -1)) {
        expect(source.slice(passage.end - 2, passage.end)).toBe('\n\n');
      }
    });

    it('chaque passage suivant commence au début d’un mot', () => {
      for (const passage of passages.slice(1)) {
        expect(source[passage.start - 1]).toMatch(/\s/);
        expect(source[passage.start]).toMatch(/\S/);
      }
    });
  });

  describe('où tombe la coupe', () => {
    it('sur une fin de paragraphe entre 1 000 et 1 600, de préférence à une fin de phrase', () => {
      const source = `${prose(1450)}\n\n${prose(1500)}`;

      const [first] = chunkText(source);

      expect(first?.end).toBe(1452);
    });

    it('parmi plusieurs fins de paragraphe, sur la plus proche de 1 200 caractères', () => {
      const source = `${prose(1048)}\n\n${prose(498)}\n\n${prose(1500)}`;

      const [first] = chunkText(source);

      expect(first?.end).toBe(1050);
    });

    it('ignore une fin de paragraphe avant 1 000 et coupe alors sur une fin de phrase', () => {
      const source = `${words(500)}\n\n${words(800)}. ${words(1500)}`;

      const [first] = chunkText(source);

      expect(first?.end).toBe(1304);
      expect(source.slice(1302, 1304)).toBe('. ');
    });

    it('sans fin de paragraphe ni de phrase, sur une espace', () => {
      const source = words(3000);

      const [first] = chunkText(source);

      expect(first?.end).toBeGreaterThanOrEqual(1000);
      expect(first?.end).toBeLessThanOrEqual(1600);
      expect(source[(first?.end ?? 0) - 1]).toBe(' ');
    });

    it('sans aucune espace, à 1 600 caractères, avec 150 caractères de chevauchement', () => {
      const source = 'x'.repeat(2000);

      expect(chunkText(source)).toEqual([
        { ord: 0, text: 'x'.repeat(1600), start: 0, end: 1600 },
        { ord: 1, text: 'x'.repeat(550), start: 1450, end: 2000 },
      ]);
    });

    it('ne coupe jamais un caractère en deux (paire de substitution)', () => {
      const source = `${'x'.repeat(1599)}😀${'x'.repeat(500)}`;

      const passages = chunkText(source);

      expect(passages[0]?.end).toBe(1599);
      for (const passage of passages) expect(passage.text).not.toMatch(LONE_SURROGATE);
    });
  });

  it('retire les marqueurs d’un long texte, en gardant les positions dans le texte source', () => {
    const source = `${prose(700)}${START}contrat${END} ${prose(2500)}`;

    const passages = chunkText(source);

    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(passage.text).not.toMatch(/[\uE000\uE001]/);
      expect(passage.text).toBe(
        source.slice(passage.start, passage.end).replace(/[\uE000\uE001]/g, ''),
      );
    }
  });
});
