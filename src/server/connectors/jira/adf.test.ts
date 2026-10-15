import { describe, expect, it } from 'vitest';
import { adfToText } from './adf';

// Les nœuds sont écrits à la main, d'après les exemples de la doc du format
// (developer.atlassian.com/cloud/jira/platform/apis/document).

const text = (value: string, marks?: Array<{ type: string }>) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ version: 1, type: 'doc', content });
const item = (...content: unknown[]) => ({ type: 'listItem', content });

describe('adfToText : blocs', () => {
  it('rend un texte vide pour ce qui n’est pas un document', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
    expect(adfToText(42)).toBe('');
    expect(adfToText({})).toBe('');
    expect(adfToText(doc())).toBe('');
  });

  it('rend tel quel un corps déjà en texte', () => {
    expect(adfToText('  Bonjour  ')).toBe('Bonjour');
  });

  it('sépare les paragraphes par une ligne vide et ignore la mise en forme', () => {
    const body = doc(
      paragraph(
        text('Un '),
        text('mot', [{ type: 'strong' }]),
        text(' et un lien', [{ type: 'link' }]),
      ),
      paragraph(text('Deux')),
    );

    expect(adfToText(body)).toBe('Un mot et un lien\n\nDeux');
  });

  it('écrit les titres avec des dièses, pour que la découpe les reconnaisse', () => {
    const body = doc(
      { type: 'heading', attrs: { level: 1 }, content: [text('Titre')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Sous-titre')] },
    );

    expect(adfToText(body)).toBe('# Titre\n\n### Sous-titre');
  });

  it('écrit les listes à puces, numérotées et imbriquées', () => {
    const body = doc(
      {
        type: 'bulletList',
        content: [
          item(paragraph(text('a'))),
          item(paragraph(text('b')), {
            type: 'orderedList',
            content: [item(paragraph(text('b1'))), item(paragraph(text('b2')))],
          }),
        ],
      },
      { type: 'orderedList', attrs: { order: 3 }, content: [item(paragraph(text('c')))] },
    );

    expect(adfToText(body)).toBe('- a\n- b\n  1. b1\n  2. b2\n\n3. c');
  });

  it('ignore les blocs de code, les règles et les médias sans laisser de lignes vides', () => {
    const body = doc(
      paragraph(text('avant')),
      { type: 'codeBlock', attrs: { language: 'sql' }, content: [text('select 1')] },
      { type: 'rule' },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x', type: 'file' } }] },
      paragraph(text('après')),
    );

    expect(adfToText(body)).toBe('avant\n\naprès');
  });

  it('descend dans les citations, les encadrés et les sections repliables', () => {
    const body = doc(
      { type: 'blockquote', content: [paragraph(text('cité'))] },
      { type: 'panel', attrs: { panelType: 'info' }, content: [paragraph(text('à savoir'))] },
      { type: 'expand', attrs: { title: 'Détails' }, content: [paragraph(text('caché'))] },
    );

    expect(adfToText(body)).toBe('cité\n\nà savoir\n\nDétails\n\ncaché');
  });

  it('écrit un tableau ligne par ligne, cellules séparées par une barre', () => {
    const cell = (type: string, value: string) => ({ type, content: [paragraph(text(value))] });
    const body = doc({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('tableHeader', 'Nom'), cell('tableHeader', 'Rôle')],
        },
        {
          type: 'tableRow',
          content: [cell('tableCell', 'Marie'), cell('tableCell', 'Cheffe de projet')],
        },
      ],
    });

    expect(adfToText(body)).toBe('Nom | Rôle\nMarie | Cheffe de projet');
  });

  it('écrit les tâches avec leur état', () => {
    const task = (state: string, value: string) => ({
      type: 'taskItem',
      attrs: { localId: value, state },
      content: [text(value)],
    });
    const body = doc({
      type: 'taskList',
      attrs: { localId: 'l' },
      content: [task('TODO', 'Écrire la spec'), task('DONE', 'Relire')],
    });

    expect(adfToText(body)).toBe('- [ ] Écrire la spec\n- [x] Relire');
  });
});

describe('adfToText : éléments de ligne', () => {
  it('écrit une mention avec le nom affiché', () => {
    const body = doc(
      paragraph(
        text('Merci '),
        { type: 'mention', attrs: { id: 'abc', text: '@Paul Martin', userType: 'DEFAULT' } },
        text('.'),
      ),
    );

    expect(adfToText(body)).toBe('Merci @Paul Martin.');
  });

  it('écrit un saut de ligne, un emoji, un lien, un statut et une date', () => {
    const body = doc(
      paragraph(
        text('a'),
        { type: 'hardBreak' },
        text('b'),
        { type: 'emoji', attrs: { shortName: ':grinning:', text: '😀' } },
        { type: 'emoji', attrs: { shortName: ':awthanks:' } },
        text(' '),
        { type: 'inlineCard', attrs: { url: 'https://acme.test/doc' } },
        text(' '),
        { type: 'status', attrs: { text: 'À FAIRE', color: 'neutral' } },
        text(' '),
        { type: 'date', attrs: { timestamp: '1792022400000' } },
      ),
    );

    expect(adfToText(body)).toBe('a\nb😀:awthanks: https://acme.test/doc À FAIRE 2026-10-15');
  });

  it('ignore une date illisible et un lien sans adresse', () => {
    const body = doc(
      paragraph(
        text('x'),
        { type: 'date', attrs: { timestamp: 'pas-un-nombre' } },
        { type: 'inlineCard', attrs: { data: {} } },
      ),
    );

    expect(adfToText(body)).toBe('x');
  });
});

describe('adfToText : formats inattendus', () => {
  it('garde le texte d’un nœud inconnu et descend dans son contenu', () => {
    const body = doc(
      { type: 'futureBlock', content: [paragraph(text('un'))] },
      paragraph({ type: 'futureInline', attrs: { text: 'deux' } }),
    );

    expect(adfToText(body)).toBe('un\n\ndeux');
  });

  it('ne plante pas sur un contenu mal formé', () => {
    const body = {
      type: 'doc',
      content: [null, 3, 'texte', { type: 'paragraph', content: 'pas une liste' }, { content: [] }],
    };

    expect(adfToText(body)).toBe('');
  });

  it('s’arrête à une profondeur raisonnable au lieu de saturer la pile', () => {
    let node: unknown = paragraph(text('au fond'));
    for (let level = 0; level < 5_000; level++) node = { type: 'blockquote', content: [node] };

    expect(() => adfToText(doc(node))).not.toThrow();
    expect(adfToText(doc(node))).not.toContain('au fond');
  });
});
