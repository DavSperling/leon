import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

// Un menu flottant s'affiche dans un portail : dans le DOM il est hors du formulaire de création,
// mais pour React il en reste un descendant, et son submit remonte jusqu'à lui.
const FORMS = productionSources('src/components/tasks/pickers/**/*.tsx').filter(({ text }) =>
  /<form\b/.test(text),
);

describe('formulaires dans les sélecteurs', () => {
  it('trouve le champ « Autre date »', () => {
    expect(FORMS.map(({ path }) => path)).toContain(
      'src/components/tasks/pickers/due-date-picker.tsx',
    );
  });

  it('isolent leur submit du formulaire qui les contient', () => {
    const open = FORMS.filter(({ text }) => !/stopPropagation\(\)/.test(text));
    expect(open.map(({ path }) => path)).toEqual([]);
  });
});
