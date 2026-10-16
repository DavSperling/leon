import { describe, expect, it } from 'vitest';
import { bindingKeys, SHORTCUTS, type ShortcutId, shortcutOf } from '@/components/tasks/shortcuts';
import { productionSources, readText } from './files';

// La table des raccourcis alimente l'écouteur, l'aide et les infobulles : une entrée que personne
// n'inscrit s'afficherait sans rien faire, et une touche qu'un composant lit en dur ne suivrait pas
// un changement de la table.

const registering = productionSources('src/components/**/*.{ts,tsx}').filter(({ text }) =>
  /useTaskShortcuts\(\{|registry\.register\(\{/.test(text),
);

describe('raccourcis et gestionnaires', () => {
  const handled = SHORTCUTS.filter(({ elsewhere }) => !elsewhere).map(({ id }) => id);

  it.each(handled)('%s a un seul fichier qui répond', (id) => {
    const key = new RegExp(`[{,\\s]['"]?${id}['"]?\\s*:`);
    const owners = registering.filter(({ text }) => key.test(text)).map(({ path }) => path);
    expect(owners).toHaveLength(1);
  });
});

// Les touches que l'écouteur des tâches laisse à d'autres composants : ils les lisent en dur.
const READERS: Array<{ id: ShortcutId; path: string; announces: boolean }> = [
  { id: 'palette', path: 'src/components/command-search.tsx', announces: true },
  { id: 'rail', path: 'src/components/shell-frame.tsx', announces: true },
  { id: 'escape', path: 'src/components/tasks/back-on-escape.tsx', announces: false },
];

describe('raccourcis lus ailleurs', () => {
  it('chaque touche laissée à d’autres a son lecteur', () => {
    const elsewhere = SHORTCUTS.filter((shortcut) => shortcut.elsewhere).map(({ id }) => id);
    expect(READERS.map(({ id }) => id).sort()).toEqual(elsewhere.sort());
  });

  it.each(READERS)('$id : $path écoute la touche de la table', ({ id, path }) => {
    const text = readText(path);
    for (const { key } of shortcutOf(id).bindings) expect(text).toContain(`'${key}'`);
  });

  it.each(READERS.filter(({ announces }) => announces))(
    '$id : $path annonce la touche de la table',
    ({ id, path }) => {
      const text = readText(path);
      expect(text).toContain(`ariaKeys('${id}')`);
      for (const binding of shortcutOf(id).bindings) {
        expect(text).toContain(bindingKeys(binding).join(''));
      }
    },
  );
});
