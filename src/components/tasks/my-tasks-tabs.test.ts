import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, parseViewParams, type ViewConfig } from '@/lib/tasks/view-config';
import { pageRoutes, readText } from '@/test/contracts/files';
import { myTasksTab, TABS } from './my-tasks-tabs';
import { currentNavKey } from './task-nav';
import { PAGE_PARAMS } from './use-view-navigation';

const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const withFilters = (filters: Partial<ViewConfig['filters']>): ViewConfig => ({
  ...DEFAULT_VIEW_CONFIG,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, ...filters },
});

describe('myTasksTab', () => {
  it('n’est pas « Mes tâches » sans filtre sur moi', () => {
    expect(myTasksTab(null, DEFAULT_VIEW_CONFIG)).toBeNull();
    expect(myTasksTab(null, withFilters({ assignee: ID }))).toBeNull();
  });

  it('donne Assignées pour assigne=moi, et Créées pour createur=moi', () => {
    expect(myTasksTab(null, withFilters({ assignee: 'me' }))).toBe('assigned');
    expect(myTasksTab(null, withFilters({ creator: 'me' }))).toBe('created');
  });

  it('donne Assignées quand les deux filtres sont posés', () => {
    expect(myTasksTab(null, withFilters({ assignee: 'me', creator: 'me' }))).toBe('assigned');
  });

  it('laisse la place à une vue enregistrée ou à un projet, qui ont leur propre nom', () => {
    expect(myTasksTab('Bugs ouverts', withFilters({ assignee: 'me' }))).toBeNull();
    expect(myTasksTab(null, withFilters({ assignee: 'me', projectId: ID }))).toBeNull();
  });
});

// L'adresse de chaque onglet est écrite à plusieurs endroits (les onglets, la navigation, la page,
// les paramètres qui survivent à un changement d'affichage) : rien d'autre ne les relie.
describe('adresses des onglets', () => {
  it.each(TABS)(
    'l’onglet $tab mène à la liste, que la navigation range sous « Mes tâches »',
    ({ tab, href }) => {
      const url = new URL(href, 'http://leon.test');
      expect(pageRoutes()).toContain(url.pathname);
      expect(currentNavKey(url.pathname, url.searchParams)).toBe('mine');
      if (tab === 'activity') {
        expect(PAGE_PARAMS).toContain('onglet');
        const page = readText('src/app/(taches)/taches/page.tsx');
        expect(page).toContain(`=== '${url.searchParams.get('onglet')}'`);
      } else {
        expect(myTasksTab(null, parseViewParams(url.searchParams, DEFAULT_VIEW_CONFIG))).toBe(tab);
      }
    },
  );
});
