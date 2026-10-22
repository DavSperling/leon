import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SOURCE_KINDS } from '@/capture/turn';
import { SourceChip } from './chips';

const render = (kind: string, label = 'Outil') =>
  renderToStaticMarkup(createElement(SourceChip, { kind, label }));

describe('SourceChip', () => {
  it('dessine une icône (ou le logo de l’outil) et le libellé pour chaque outil que le code connaît', () => {
    for (const kind of SOURCE_KINDS) {
      const html = render(kind, 'Mon outil');

      expect(html, kind).toMatch(/<svg|<img/);
      expect(html, kind).toContain('Mon outil');
    }
  });

  // `sources.kind` n'a plus de contrainte en base : une ligne d'un autre outil, ou d'une autre version du code,
  // arrive jusqu'ici. Une icône absente ferait tomber toute la page qui l'affiche.
  it('prend l’icône de repli pour un outil que le code ne connaît pas', () => {
    for (const kind of [
      'nouvel_outil',
      'ancien_outil',
      '',
      'constructor',
      'toString',
      '__proto__',
    ]) {
      const html = render(kind, 'Un outil');

      expect(html, JSON.stringify(kind)).toContain('<svg');
      expect(html, JSON.stringify(kind)).toContain('Un outil');
    }
  });
});
