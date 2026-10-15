import { describe, expect, it } from 'vitest';
import { normalizeItem } from '../normalize';
import type { Board, BoardItem } from './client';
import { boardToItem } from './map';

// De la réponse de Miro à un élément du socle : un tableau est une page, son texte est celui de
// ses éléments, rangés par cadre.

const AT = Date.parse('2026-10-02T09:30:00Z');

const board = (extra: Partial<Board> = {}): Board => ({
  id: 'b1=',
  name: 'Atelier',
  time: AT,
  ...extra,
});

const note = (id: string, content: string, parent?: string): BoardItem => ({
  id,
  type: 'sticky_note',
  data: { content },
  ...(parent ? { parent: { id: parent } } : {}),
});

const frame = (id: string, title: string | null): BoardItem => ({
  id,
  type: 'frame',
  data: { title },
});

const textOf = (item: ReturnType<typeof boardToItem>) => item?.turns[0]?.text;

describe('boardToItem', () => {
  it('rend le tableau comme une page : un tour document, daté de la dernière modification', () => {
    const item = boardToItem(
      board({
        description: 'Priorités du trimestre.',
        viewLink: 'https://miro.com/app/board/b1=/',
        owner: { name: 'Marie Durand' },
        team: { name: 'Acme' },
        project: { name: 'Produit' },
      }),
      [note('n1', '<p>Refaire l’accueil</p>')],
    );

    expect(item).toEqual({
      externalId: 'board:b1=',
      nature: 'page',
      title: 'Atelier',
      url: 'https://miro.com/app/board/b1=/',
      updatedAt: '2026-10-02T09:30:00.000Z',
      origin: { team: 'Acme', project: 'Produit' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: null },
          text: 'Priorités du trimestre.\n\n- Refaire l’accueil',
          ts: '2026-10-02T09:30:00.000Z',
        },
      ],
    });
  });

  it('range le texte par cadre : hors cadre d’abord, puis un titre par cadre', () => {
    const item = boardToItem(board(), [
      frame('f1', 'Idées'),
      note('n1', '<p>Dans le cadre</p>', 'f1'),
      note('n2', '<p>Hors cadre</p>'),
      frame('f2', 'Risques'),
      note('n3', '<p>Autre cadre</p>', 'f2'),
    ]);

    expect(textOf(item)).toBe(
      '- Hors cadre\n\n## Idées\n- Dans le cadre\n\n## Risques\n- Autre cadre',
    );
  });

  it('lit les notes, textes et formes en HTML, les cartes par titre et description', () => {
    const items: BoardItem[] = [
      note('n1', '<p>Une note</p>'),
      {
        id: 't1',
        type: 'text',
        data: { content: '<p>Objectif : 10 clients &amp; 2 partenaires</p>' },
      },
      { id: 's1', type: 'shape', data: { content: '<p>Étape 1</p>' } },
      {
        id: 'c1',
        type: 'card',
        data: { title: 'Brancher Miro', description: 'Lire les tableaux' },
      },
      { id: 'c2', type: 'card', data: { title: 'Sans description' } },
      { id: 'a1', type: 'app_card', data: { title: 'Ticket 12', description: 'Suivi' } },
    ];

    expect(textOf(boardToItem(board(), items))).toBe(
      [
        '- Une note',
        '- Objectif : 10 clients & 2 partenaires',
        '- Étape 1',
        '- Brancher Miro : Lire les tableaux',
        '- Sans description',
        '- Ticket 12 : Suivi',
      ].join('\n'),
    );
  });

  it('garde un document de Miro (Markdown) tel quel, sans puce', () => {
    const doc: BoardItem = {
      id: 'd1',
      type: 'doc_format',
      data: { content: '## Compte rendu\n\nOn avance.' },
    };

    expect(textOf(boardToItem(board(), [doc]))).toBe('## Compte rendu\n\nOn avance.');
  });

  it('indente la suite d’une note sur plusieurs lignes pour rester dans la même puce', () => {
    const item = boardToItem(board(), [
      note('n1', '<p>Refaire l’accueil</p><p>avant novembre</p>'),
    ]);

    expect(textOf(item)).toBe('- Refaire l’accueil\n  avant novembre');
  });

  it('ignore les images et les types inconnus, et les notes vides', () => {
    const items: BoardItem[] = [
      { id: 'i1', type: 'image', data: { title: 'maquette.png' } },
      { id: 'e1', type: 'embed', data: { title: 'Vidéo' } },
      { id: 'x1', type: 'nouveau_type', data: { content: 'inconnu' } },
      note('n1', '<p> </p>'),
      note('n2', '<p>Seule note</p>'),
    ];

    expect(textOf(boardToItem(board(), items))).toBe('- Seule note');
  });

  it('rend « Cadre sans titre » pour un cadre sans titre, et oublie un cadre sans texte', () => {
    const item = boardToItem(board(), [
      frame('f1', null),
      note('n1', '<p>Dedans</p>', 'f1'),
      frame('f2', 'Vide'),
    ]);

    expect(textOf(item)).toBe('## Cadre sans titre\n- Dedans');
  });

  it('range hors cadre un élément dont le parent n’est pas un cadre', () => {
    const item = boardToItem(board(), [note('n1', '<p>Orphelin</p>', 'inconnu')]);

    expect(textOf(item)).toBe('- Orphelin');
  });

  it('rend la description seule quand le tableau n’a pas d’autre texte', () => {
    const item = boardToItem(board({ description: 'Notes de départ.' }), []);

    expect(textOf(item)).toBe('Notes de départ.');
  });

  it('ne rend rien d’un tableau sans description ni texte', () => {
    expect(boardToItem(board({ description: '  ' }), [])).toBeNull();
    expect(
      boardToItem(board(), [{ id: 'i1', type: 'image', data: { title: 'a.png' } }]),
    ).toBeNull();
  });

  it('laisse l’adresse, l’auteur et l’origine vides quand Miro ne les donne pas', () => {
    const item = boardToItem(board(), [note('n1', '<p>Texte</p>')]);

    expect(item).toMatchObject({ url: null, origin: {} });
    expect(item?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('passe la normalisation du socle', () => {
    const item = boardToItem(board({ description: 'Contexte' }), [note('n1', '<p>Texte</p>')]);

    expect(item && normalizeItem(item, 'miro')).not.toBeNull();
  });
});
