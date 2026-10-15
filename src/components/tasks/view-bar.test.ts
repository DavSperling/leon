import { describe, expect, it } from 'vitest';
import { pageRoutes } from '@/test/contracts/files';
import { TABS } from './my-tasks-tabs';
import { buildTabs, type SavedView } from './view-bar';

const PROJECT = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const VIEWS: SavedView[] = [
  { id: 'v-all', name: 'Par priorité', context: 'all' },
  { id: 'v-mine', name: 'Mes urgences', context: 'mine' },
  { id: 'v-project', name: 'Sprint', context: `project:${PROJECT}` },
  { id: 'v-other', name: 'Autre projet', context: 'project:autre' },
];
const tabs = (input: Partial<Parameters<typeof buildTabs>[0]>) =>
  buildTabs({ context: 'all', viewId: null, mineTab: null, views: VIEWS, ...input });
const labels = (list: ReturnType<typeof tabs>) => list.map((tab) => tab.label);
const currentLabels = (list: ReturnType<typeof tabs>) =>
  list.filter((tab) => tab.current).map((tab) => tab.label);

describe('buildTabs', () => {
  it('« Toutes », puis les vues enregistrées du contexte seulement', () => {
    expect(labels(tabs({}))).toEqual(['Toutes', 'Par priorité']);
    expect(labels(tabs({ context: `project:${PROJECT}` }))).toEqual(['Toutes', 'Sprint']);
    expect(labels(tabs({ context: 'project:inconnu' }))).toEqual(['Toutes']);
  });

  it('marque « Toutes » quand aucune vue n’est ouverte, et la vue ouverte sinon', () => {
    expect(currentLabels(tabs({}))).toEqual(['Toutes']);
    expect(currentLabels(tabs({ viewId: 'v-all' }))).toEqual(['Par priorité']);
  });

  it('mène « Toutes » à la liste du contexte : toutes les tâches, ou celles du projet', () => {
    expect(tabs({})[0]?.href).toBe('/taches');
    expect(tabs({ context: `project:${PROJECT}` })[0]?.href).toBe(`/taches?projet=${PROJECT}`);
  });

  it('mène chaque vue à son adresse', () => {
    expect(tabs({})[1]?.href).toBe('/taches?vue=v-all');
  });

  it('pour « Mes tâches », ajoute les vues aux onglets Assignées, Créées, Activité', () => {
    const mine = tabs({ context: 'mine', mineTab: 'created' });

    expect(labels(mine)).toEqual([...TABS.map((tab) => tab.label), 'Mes urgences']);
    expect(currentLabels(mine)).toEqual(['Créées']);
  });

  it('ne marque aucun onglet de « Mes tâches » quand une vue est ouverte', () => {
    const mine = tabs({ context: 'mine', mineTab: null, viewId: 'v-mine' });

    expect(currentLabels(mine)).toEqual(['Mes urgences']);
  });

  it('mène chaque onglet à une page qui existe', () => {
    const hrefs = [
      ...tabs({}),
      ...tabs({ context: 'mine' }),
      ...tabs({ context: `project:${PROJECT}` }),
    ].map((tab) => new URL(tab.href, 'http://leon.test').pathname);
    for (const path of hrefs) expect(pageRoutes()).toContain(path);
  });
});
