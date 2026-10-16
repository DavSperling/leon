import { describe, expect, it } from 'vitest';
import { ThemeSchema } from '@/lib/theme-cookie';
import {
  matchingActions,
  type PaletteAction,
  paletteActions,
  taskRefTarget,
} from './palette-actions';
import { THEME_CHOICES } from './theme-choices';

const VIEW = { id: '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90', name: 'Bugs ouverts' };
const everything = paletteActions({ views: [VIEW], canCreate: true, hasShortcuts: true });
const ids = (actions: PaletteAction[]) => actions.map(({ id }) => id);

describe('taskRefTarget', () => {
  it('reconnaît un identifiant de tâche, quelle que soit la casse', () => {
    expect(taskRefTarget('leo-12')).toBe('LEO-12');
    expect(taskRefTarget('  LEO-3 ')).toBe('LEO-3');
  });

  it('laisse passer toute autre saisie', () => {
    expect(taskRefTarget('')).toBeNull();
    expect(taskRefTarget('leo 12')).toBeNull();
    expect(taskRefTarget('leo-0')).toBeNull();
    expect(taskRefTarget('devis')).toBeNull();
  });
});

describe('paletteActions', () => {
  it('propose créer une tâche, le thème, les vues enregistrées et l’aide', () => {
    expect(ids(everything)).toEqual([
      'create',
      'mine',
      'theme-clair',
      'theme-sombre',
      'theme-systeme',
      `view-${VIEW.id}`,
      'help',
    ]);
  });

  it('retire ce que la page ne sait pas faire', () => {
    const bare = paletteActions({ views: [], canCreate: false, hasShortcuts: false });
    expect(ids(bare)).toEqual(['mine', 'theme-clair', 'theme-sombre', 'theme-systeme']);
  });

  it('n’affiche la capsule G M que là où la touche répond', () => {
    const mine = (hasShortcuts: boolean) =>
      paletteActions({ views: [], canCreate: false, hasShortcuts }).find(({ id }) => id === 'mine');
    expect(mine(true)?.key).toBe('go-mine');
    expect(mine(false)?.key).toBeUndefined();
  });

  it('propose chaque thème que le cookie accepte', () => {
    expect(THEME_CHOICES.map(({ value }) => value).sort()).toEqual([...ThemeSchema.options].sort());
  });

  it('mène une vue enregistrée à sa page', () => {
    const view = everything.find(({ id }) => id === `view-${VIEW.id}`);
    expect(view?.effect).toEqual({ href: `/taches?vue=${VIEW.id}` });
  });
});

describe('matchingActions', () => {
  it('garde tout sans saisie', () => {
    expect(matchingActions(everything, '  ')).toEqual(everything);
  });

  it('trouve sans tenir compte des accents ni de la casse', () => {
    expect(ids(matchingActions(everything, 'THEME'))).toEqual([
      'theme-clair',
      'theme-sombre',
      'theme-systeme',
    ]);
    expect(ids(matchingActions(everything, 'sombre'))).toEqual(['theme-sombre']);
  });

  it('cherche aussi dans les mots-clés', () => {
    expect(ids(matchingActions(everything, 'nouvelle'))).toEqual(['create']);
    expect(ids(matchingActions(everything, 'vue'))).toEqual([`view-${VIEW.id}`]);
  });

  it('ne trouve rien pour une saisie sans rapport', () => {
    expect(matchingActions(everything, 'zzz')).toEqual([]);
  });
});
