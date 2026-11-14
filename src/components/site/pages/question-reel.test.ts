import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuestionReel } from './question-reel';

// Sans script, la page est entière : la première question est dans le champ (caché aux lecteurs d'écran, qui ont la
// liste), et la liste porte toutes les questions, la première sous le trait.
describe('QuestionReel', () => {
  const items = [
    { q: 'has the fix shipped?', aside: 'Customer support', href: '/cas-usage/support' },
    { q: 'type:meeting since:7d', aside: 'Leadership', href: '/cas-usage/direction' },
  ];
  const html = renderToStaticMarkup(createElement(QuestionReel, { items }));

  it('montre la première question dans le champ, hors des lecteurs d’écran', () => {
    expect(html).toMatch(
      /<p aria-hidden="true" data-pm="ask" class="pg-ask pg-reel__field">.*has the fix shipped\?/,
    );
  });

  it('garde toutes les questions dans la liste, chacune avec son lien, la première marquée', () => {
    expect(html.match(/class="pg-reel__row"/g)).toHaveLength(2);
    expect(html).toContain('href="/cas-usage/direction"');
    expect(html.match(/data-on=""/g)).toHaveLength(1);
  });

  it('ne rend rien sans question', () => {
    expect(renderToStaticMarkup(createElement(QuestionReel, { items: [] }))).toBe('');
  });
});
