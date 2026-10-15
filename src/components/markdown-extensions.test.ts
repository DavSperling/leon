import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { DOMOutputSpec, Mark, Node as ProseNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { readText } from '@/test/contracts/files';
import {
  editorCanHold,
  isAllowedLink,
  markdownExtensions,
  toStoredMarkdown,
} from './markdown-extensions';

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

// Ce que l'éditeur sait lire et réécrire à l'identique.
const HELD: Array<[string, string]> = [
  ['titres', '# Un\n\n## Deux\n\n### Trois\n\n#### Quatre\n\n###### Six'],
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
  ['mise en forme dans une case', '- [x] une **case** avec `code`'],
];

describe('aller-retour Markdown', () => {
  it.each(HELD)('%s', (_name, markdown) => {
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

describe('titres', () => {
  it.each([1, 2, 3, 4, 5, 6])('le niveau %i s’affiche comme son titre', (level) => {
    const heading = schema.nodes.heading;
    if (!heading) throw new Error('Le schéma de l’éditeur n’a pas de titre.');
    const toDOM = heading.spec.toDOM as (node: ProseNode) => DOMOutputSpec & unknown[];
    expect(toDOM(heading.create({ level }))[0]).toBe(`h${level}`);
  });
});

describe('borne de longueur', () => {
  const limitOf = (maxLength?: number) =>
    markdownExtensions('', maxLength).find((e) => e.name === 'characterCount')?.options.limit;

  it('relaie la borne donnée au compteur de caractères', () => {
    expect(limitOf(20_000)).toBe(20_000);
  });

  it('n’ajoute pas de compteur sans borne', () => {
    expect(markdownExtensions('').map((e) => e.name)).not.toContain('characterCount');
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

  it.each([
    ['https://exemple.fr', 'https://exemple.fr'],
    ['javascript:alert(1)', ''],
    ['ftp://exemple.fr', ''],
    ['/taches/LEO-12', ''],
  ])("l'éditeur écrit %j dans le DOM sous la forme %j", (href, written) => {
    const link = schema.marks.link;
    if (!link) throw new Error('Le schéma de l’éditeur n’a pas de lien.');
    const toDOM = link.spec.toDOM as (mark: Mark, inline: boolean) => DOMOutputSpec & unknown[];
    expect((toDOM(link.create({ href }), true)[1] as { href: string }).href).toBe(written);
  });

  it('un lien sans adresse est inerte à l’écran', () => {
    expect(readText('src/components/markdown-editor.css')).toContain('a[href=""]');
  });
});

describe('ce que l’éditeur peut tenir', () => {
  it.each(HELD)('%s : tenu', (_name, markdown) => {
    expect(editorCanHold(markdown)).toBe(true);
  });

  it('un texte vide est tenu', () => {
    expect(editorCanHold('')).toBe(true);
  });

  it('une liste mêlant cases et puces est tenue', () => {
    expect(editorCanHold('- [ ] une case\n- une puce')).toBe(true);
  });

  it.each([
    ['tableau', 'Critères :\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nFin'],
    ['tableau seul', '| a | b |\n|---|---|\n| 1 | 2 |'],
    ['tableau dans une liste', '- a\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |'],
    ['image', 'Voir ![capture](https://exemple.fr/a.png) ci-dessus'],
    ['image seule', '![capture](https://exemple.fr/a.png)'],
    ['image dans une case', '- [ ] une case ![i](https://exemple.fr/a.png)'],
    ['image dans une puce', '- ![i](https://exemple.fr/a.png)'],
    ['HTML en ligne', 'du <b>gras</b>'],
    ['HTML en bloc', '<div>texte</div>\n\nsuite'],
    ['HTML dans une citation', '> <b>texte</b>'],
    ['HTML dans une case', '- [ ] <b>texte</b>'],
    ['lien en HTML', '<a href="https://exemple.fr" class="fixed inset-0" target="_self">ici</a>'],
    ['chevrons hors code', 'une List<string> nue'],
    ['définition de lien', '[a]\n\n[a]: https://exemple.fr'],
  ])('%s : reconnu comme non éditable', (_name, markdown) => {
    expect(editorCanHold(markdown)).toBe(false);
  });

  it('du HTML dans un bloc de code ou du code en ligne reste tenu', () => {
    expect(editorCanHold('```html\n<b>x</b>\n```\n\net `<i>y</i>`')).toBe(true);
  });
});

describe('Markdown enregistré', () => {
  const paragraph = (text?: string): JSONContent => ({
    type: 'paragraph',
    ...(text === undefined ? {} : { content: [{ type: 'text', text }] }),
  });
  const stored = (...content: JSONContent[]) =>
    toStoredMarkdown(manager.serialize({ type: 'doc', content }));

  it('ne garde aucun « &nbsp; » à la fin', () => {
    expect(stored(paragraph('a'), paragraph(), paragraph())).toBe('a');
    expect(stored(paragraph('a'), paragraph(), paragraph(), paragraph())).toBe('a');
  });

  it('ne garde aucun « &nbsp; » entre deux paragraphes', () => {
    const markdown = stored(paragraph('a'), paragraph(), paragraph(), paragraph('b'));
    expect(markdown).not.toContain('&nbsp;');
    expect(markdown.startsWith('a')).toBe(true);
    expect(markdown.endsWith('b')).toBe(true);
  });

  it('un document de paragraphes vides est vide', () => {
    expect(stored(paragraph(), paragraph(), paragraph())).toBe('');
  });

  it('laisse le texte intact', () => {
    expect(toStoredMarkdown('# Un\n\n- a\n- b')).toBe('# Un\n\n- a\n- b');
  });
});
