import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { DOMOutputSpec, Mark } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { isAllowedLink, markdownExtensions } from './markdown-extensions';

// Sans DOM : le gestionnaire Markdown de TipTap et le schéma de l'éditeur suffisent à vérifier ce que
// l'éditeur lit et réécrit. Rien ici ne passe par un navigateur.
const extensions = markdownExtensions('');
const manager = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

// Le Markdown devient un document que le schéma accepte, puis redevient du Markdown.
function roundTrip(markdown: string): { json: JSONContent; markdown: string } {
  const json = manager.parse(markdown);
  schema.nodeFromJSON(json).check();
  return { json, markdown: manager.serialize(json) };
}

describe('aller-retour Markdown', () => {
  it.each([
    ['titres', '# Un\n\n## Deux\n\n### Trois'],
    ['liste à puces imbriquée', '- un\n- deux\n  - sous-liste\n- trois'],
    ['liste numérotée', '1. un\n2. deux\n3. trois'],
    ['cases cochées et non cochées', '- [ ] à faire\n- [x] fait'],
    ['bloc de code avec langage', '```ts\nconst a = 1;\n```'],
    ['bloc de code sans langage', '```\nsans langage\n```'],
    ['citation', '> une citation\n> sur deux lignes'],
    ['séparateur', 'avant\n\n---\n\naprès'],
    ['paragraphes', 'un\n\ndeux'],
    ['saut de ligne simple', 'un\ndeux'],
    ['mise en forme', 'Du **gras**, de l’*italique*, du `code` et du ~~barré~~.'],
    ['lien', 'Voir [la page](https://exemple.fr/page) ou écrire à [Amos](mailto:amos@exemple.fr).'],
  ])('%s', (_name, markdown) => {
    expect(roundTrip(markdown).markdown).toBe(markdown);
  });

  it('lit les titres, les cases et le langage du code comme tels', () => {
    const { json } = roundTrip(
      '## Plan\n\n- [x] fait\n- [ ] à faire\n\n```ts\nlet a;\n```\n\n> mot',
    );
    expect(json.content).toMatchObject([
      { type: 'heading', attrs: { level: 2 } },
      { type: 'taskList', content: [{ attrs: { checked: true } }, { attrs: { checked: false } }] },
      { type: 'codeBlock', attrs: { language: 'ts' } },
      { type: 'blockquote' },
    ]);
  });

  it('ne garde du HTML que du texte', () => {
    const { json, markdown } = roundTrip('<script>alert(1)</script>\n\ntexte');
    expect(JSON.stringify(json)).not.toContain('"script"');
    expect(markdown).toContain('texte');
  });
});

describe('borne de longueur', () => {
  it('ajoute le compteur de caractères seulement quand une borne est donnée', () => {
    const names = (maxLength?: number) => markdownExtensions('', maxLength).map((e) => e.name);
    expect(names()).not.toContain('characterCount');
    expect(names(20_000)).toContain('characterCount');
  });
});

describe('liens', () => {
  it.each([
    ['https://exemple.fr', true],
    ['HTTP://exemple.fr', true],
    ['mailto:amos@exemple.fr', true],
    ['  https://exemple.fr', true],
    ['javascript:alert(1)', false],
    ['JavaScript:alert(1)', false],
    ['data:text/html;base64,AAAA', false],
    ['tel:+33123456789', false],
    ['ftp://exemple.fr', false],
    ['/taches/LEO-1', false],
    ['//exemple.fr', false],
    ['', false],
  ])('%j → %s', (url, allowed) => {
    expect(isAllowedLink(url)).toBe(allowed);
  });

  it("l'éditeur n'écrit pas l'adresse d'un lien refusé dans le DOM", () => {
    const link = schema.marks.link;
    if (!link) throw new Error('Le schéma de l’éditeur n’a pas de lien.');
    const hrefOf = (href: string) => {
      const toDOM = link.spec.toDOM as (mark: Mark, inline: boolean) => DOMOutputSpec & unknown[];
      return (toDOM(link.create({ href }), true)[1] as { href: string }).href;
    };
    expect(hrefOf('https://exemple.fr')).toBe('https://exemple.fr');
    expect(hrefOf('javascript:alert(1)')).toBe('');
  });
});
