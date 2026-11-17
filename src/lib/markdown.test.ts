import { describe, expect, it } from 'vitest';
import { markdownBlocks, markdownInline, markdownPlain } from './markdown';

describe('markdownBlocks', () => {
  it('lit une réponse de Leon : paragraphe, ligne en gras, liste imbriquée', () => {
    const text = [
      'Voici ce qui s’est passé.',
      '',
      '**Développement**',
      '- **Onboarding.**',
      '  - Lot 1 : la page [12].',
      '  - Lot 2 [13].',
      '- **#113.** Les outils restent cochés [10].',
    ].join('\n');
    expect(markdownBlocks(text)).toEqual([
      { type: 'p', text: 'Voici ce qui s’est passé.' },
      { type: 'p', text: '**Développement**' },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [
            { type: 'p', text: '**Onboarding.**' },
            {
              type: 'list',
              ordered: false,
              start: 1,
              items: [
                [{ type: 'p', text: 'Lot 1 : la page [12].' }],
                [{ type: 'p', text: 'Lot 2 [13].' }],
              ],
            },
          ],
          [{ type: 'p', text: '**#113.** Les outils restent cochés [10].' }],
        ],
      },
    ]);
  });

  it('garde une liste numérotée séparée de lignes vides, et son premier numéro', () => {
    expect(markdownBlocks('3. un\n\n4. deux\n\nFin')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [[{ type: 'p', text: 'un' }], [{ type: 'p', text: 'deux' }]],
      },
      { type: 'p', text: 'Fin' },
    ]);
  });

  it('titres, filet, bloc de code (même non fermé), « 2026. » dans un paragraphe', () => {
    expect(
      markdownBlocks('## Bilan\nEn 2026, rien\n2026. reste du texte\n---\n```ts\nconst a = 1;'),
    ).toEqual([
      { type: 'h', level: 2, text: 'Bilan' },
      { type: 'p', text: 'En 2026, rien\n2026. reste du texte' },
      { type: 'hr' },
      { type: 'code', text: 'const a = 1;' },
    ]);
  });

  it('« #113 » en début de ligne n’est pas un titre', () => {
    expect(markdownBlocks('#113 fusionnée')).toEqual([{ type: 'p', text: '#113 fusionnée' }]);
  });
});

describe('markdownInline', () => {
  it('gras, italique et code ; les renvois restent du texte', () => {
    expect(markdownInline('**#114.** `pg_temp` passe *en dernier* [11].')).toEqual([
      { strong: ['#114.'] },
      ' ',
      { code: 'pg_temp' },
      ' passe ',
      { em: ['en dernier'] },
      ' [11].',
    ]);
  });

  it('une étoile seule, ou entourée d’espaces, reste du texte', () => {
    expect(markdownInline('2 * 3 * 4 et **pas fermé')).toEqual(['2 * 3 * 4 et **pas fermé']);
  });
});

describe('markdownPlain', () => {
  it('retire les marques (titre, gras, italique, code) et garde leur contenu', () => {
    expect(
      markdownPlain(
        '## Point\n**Refonte devis** : point du **16/10**, *urgent*, `CHA-207`.\n- Avancement',
      ),
    ).toBe('Point\nRefonte devis : point du 16/10, urgent, CHA-207.\n- Avancement');
  });

  it('plusieurs lignes vides n’en font qu’une', () => {
    expect(markdownPlain('Santé : À risque\n\n \n\n## Refonte devis')).toBe(
      'Santé : À risque\n\nRefonte devis',
    );
  });

  it('une étoile seule et un dièse hors d’une tête de ligne restent du texte', () => {
    expect(markdownPlain('2 * 3 * 4, ticket #12 et **pas fermé')).toBe(
      '2 * 3 * 4, ticket #12 et **pas fermé',
    );
  });
});
