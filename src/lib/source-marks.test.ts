import { describe, expect, it } from 'vitest';
import {
  citingSentences,
  MARK_END,
  markCited,
  sharedRuns,
  splitMarks,
  stripMarks,
} from './source-marks';

const marked = (sentence: string, passage: string) =>
  sharedRuns(sentence, passage).map((run) => sentence.slice(run.start, run.end));

// Ce qu'une réponse rendue montre surligné : les morceaux marqués, avec leur numéro.
const shown = (text: string, passages: Record<number, string>) =>
  splitMarks(markCited(text, (n) => passages[n]))
    .parts.filter((part) => part.n !== null)
    .map((part) => `${part.n}:${part.text}`);

describe('sharedRuns : les mots qu’une phrase prend à sa source', () => {
  it('marque la plus longue suite commune, sans casse ni accent, sans les petits mots aux bords', () => {
    expect(
      marked(
        'At the monthly check-in, you committed to delivering V2 on Nov 15.',
        'Karim: we commit to delivering v2 on nov 15, two weeks before their tests.',
      ),
    ).toEqual(['delivering V2 on Nov 15']);
    expect(
      marked('La réunion de chantier est déplacée', 'la REUNION de chantier aura lieu'),
    ).toEqual(['réunion de chantier']);
  });

  it('garde deux suites au plus, la plus longue d’abord, dans l’ordre de la phrase', () => {
    const runs = marked(
      'The signed quote confirms the date but excludes the data migration and the hosting costs.',
      'Signed quote, V2. Excludes: data migration. Hosting costs are billed apart.',
    );
    expect(runs).toHaveLength(2);
    expect(runs).toContain('data migration');
  });

  it('un nombre, une date ou un nom propre compte seul ; un mot ordinaire seul ne compte pas', () => {
    expect(marked('Sophie moved the migration to Dec 2.', 'The migration owner is Sophie')).toEqual(
      ['Sophie'],
    );
    expect(marked('It costs 1,842 euros a month.', 'total 1,842')).toEqual(['1,842']);
    expect(marked('The migration is late.', 'migration planned')).toEqual([]);
    expect(marked('Ask ACME first.', 'acme said no')).toEqual(['ACME']);
  });

  it('rien de partagé : rien de marqué', () => {
    expect(marked('Nobody has told them yet.', 'The weather is fine today.')).toEqual([]);
    expect(marked('', 'passage')).toEqual([]);
    expect(marked('Une phrase.', '')).toEqual([]);
  });

  it('ne ferme jamais une marque juste avant un crochet de code', () => {
    expect(marked('Read argv[0] first', 'read argv first')).toEqual([]);
  });
});

describe('markCited : les phrases d’une réponse et leurs sources', () => {
  it('la phrase du modèle factice, citée [1], ne marque que les mots du passage', () => {
    const text =
      'Réponse du modèle factice (essai sans clé) : la mémoire contient des éléments sur votre question, voir le premier résultat [1].';
    expect(
      shown(text, { 1: 'Notes de version Chantier+ : la mémoire contient des notes' }),
    ).toEqual(['1:mémoire contient']);
    // sans passage connu, le texte ne change pas
    expect(markCited(text, () => undefined)).toBe(text);
  });

  it('chaque phrase est comparée à sa propre source, et prend sa couleur', () => {
    const text =
      'V2 ships on Nov 15 [1]. The migration ticket is still open [2]. Nobody told ACME.';
    expect(
      shown(text, { 1: 'We ship V2 on Nov 15.', 2: 'ACME data migration: still open' }),
    ).toEqual(['1:V2', '1:Nov 15', '2:still open']);
  });

  it('une suite [1][3] compare la phrase aux deux passages', () => {
    const text = 'Karim owns the Verlant account and the renewal [1][3].';
    expect(shown(text, { 1: 'the owner is Karim', 3: 'Verlant renewal' })).toEqual([
      '1:Karim',
      '3:Verlant',
    ]);
  });

  it('une introduction sans renvoi et le code restent de l’encre', () => {
    const text = 'Here is what I found.\nThe file `argv[0]` is read by Leon [1].';
    const out = markCited(text, () => 'Leon reads argv');
    expect(shown(text, { 1: 'Leon reads argv' })).toEqual(['1:Leon']);
    expect(out.startsWith('Here is what I found.')).toBe(true);
  });

  it('une marque ne traverse pas le gras du Markdown', () => {
    const text = 'Delivery is on **Nov 15** for V2 [1].';
    const out = markCited(text, () => 'delivery on nov 15 for v2');
    expect(out).toContain('**');
    expect(stripMarks(out)).toBe(text);
    // aucune paire de marqueurs n'enjambe « ** »
    for (const piece of out.split('**')) {
      const { open } = splitMarks(piece);
      expect(open).toBeNull();
    }
  });

  it('un morceau coupé par le gras ne garde pas de petit mot à son bord', () => {
    expect(
      shown('Mapéo a été résilié avec effet le **05/11** [2].', {
        2: 'Résiliation Mapéo avec effet le 05/11.',
      }),
    ).toEqual(['2:Mapéo', '2:effet', '2:05/11']);
  });

  it('un renvoi collé à du code n’est pas une phrase citée', () => {
    expect(markCited('items[1] is empty', () => 'items is empty')).toBe('items[1] is empty');
  });
});

describe('markCited : deux suites voisines', () => {
  it('réunit deux suites de la même source que seule une espace sépare', () => {
    expect(
      shown('Un devis est en cours côté Karim [1].', {
        1: 'Karim : le devis est en cours côté client.',
      }),
    ).toEqual(['1:devis est en cours côté Karim']);
  });

  it('laisse séparées deux suites de sources différentes', () => {
    expect(
      shown('Le devis Dupont part chez Karim [1][2].', {
        1: 'Le devis Dupont est prêt.',
        2: 'Karim relance le client.',
      }),
    ).toEqual(['1:devis Dupont', '2:Karim']);
  });
});

describe('citingSentences : ce que la réponse dit d’une source', () => {
  it('rend les phrases qui renvoient au numéro, et elles seules', () => {
    const answer =
      'Le devis Dupont est prêt [1]. Karim relance le client [2].\n- Bati-Ouest devient client pilote [1][3].';
    expect(citingSentences(answer, 1)).toEqual([
      'Le devis Dupont est prêt',
      '- Bati-Ouest devient client pilote',
    ]);
    expect(citingSentences(answer, 2)).toEqual(['Karim relance le client']);
    expect(citingSentences(answer, 9)).toEqual([]);
  });
});

describe('splitMarks', () => {
  it('rend les morceaux et garde une marque ouverte d’un morceau à l’autre', () => {
    const first = splitMarks(`a b`);
    expect(first.parts).toEqual([
      { text: 'a ', n: null },
      { text: 'b', n: 1 },
    ]);
    expect(first.open).toBe(1);
    expect(splitMarks(`c${MARK_END} d`, first.open).parts).toEqual([
      { text: 'c', n: 1 },
      { text: ' d', n: null },
    ]);
  });
});
