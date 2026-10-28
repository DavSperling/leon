import { describe, expect, it } from 'vitest';
import { DIFF_MAX_LINES, lineDiff } from './line-diff';

const numbered = (count: number) => Array.from({ length: count }, (_, i) => `l${i + 1}`);
const text = (lines: string[]) => `${lines.join('\n')}\n`;

describe('lineDiff', () => {
  it('montre un fichier nouveau en lignes ajoutées', () => {
    expect(lineDiff('', 'a\nb\n')).toBe('+ a\n+ b');
  });

  it('montre un fichier vidé en lignes retirées', () => {
    expect(lineDiff('a\nb\n', '')).toBe('- a\n- b');
  });

  it('remplace une ligne en gardant trois lignes de contexte et un « … » pour le reste', () => {
    const after = numbered(20);
    after[9] = 'dix';

    expect(lineDiff(text(numbered(20)), text(after))).toBe(
      ['…', '  l7', '  l8', '  l9', '- l10', '+ dix', '  l11', '  l12', '  l13', '…'].join('\n'),
    );
  });

  it('ne met qu’un « … » entre deux changements éloignés, et rien entre deux proches', () => {
    const after = numbered(30);
    after[1] = 'deux';
    after[27] = 'vingt-huit';
    const diff = lineDiff(text(numbered(30)), text(after)) as string;

    expect(diff.split('\n').filter((line) => line === '…')).toHaveLength(1);
    expect(diff.startsWith('  l1\n- l2\n+ deux\n  l3')).toBe(true);
  });

  it('rend un texte vide quand rien ne change, saut de ligne final compris', () => {
    expect(lineDiff('a\nb', 'a\nb\n')).toBe('');
  });

  it('retrouve une ligne insérée au milieu sans tout réécrire', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nb\nx\nc\n')).toBe('  a\n  b\n+ x\n  c');
  });

  it('refuse un texte de plus de 3 000 lignes de chaque côté', () => {
    const big = text(numbered(DIFF_MAX_LINES + 1));

    expect(lineDiff(big, 'a\n')).toBeNull();
    expect(lineDiff('a\n', big)).toBeNull();
    expect(lineDiff(text(numbered(DIFF_MAX_LINES)), 'a\n')).not.toBeNull();
  });
});
