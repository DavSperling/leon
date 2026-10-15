import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { listTitle } from './view-toolbar';

const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const CONTEXT = {
  statuses: [],
  viewerId: 'paul',
  members: [],
  labels: [],
  projects: [{ id: ID, key: 'LEO', name: 'Leon' }],
};
const withFilters = (filters: Partial<ViewConfig['filters']>): ViewConfig => ({
  ...DEFAULT_VIEW_CONFIG,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, ...filters },
});

describe('listTitle', () => {
  it('donne « Toutes les tâches » sans critère de navigation', () => {
    expect(listTitle(null, DEFAULT_VIEW_CONFIG, CONTEXT)).toBe('Toutes les tâches');
  });

  it('donne le nom de la vue ouverte avant tout autre', () => {
    expect(listTitle('Bugs ouverts', withFilters({ projectId: ID }), CONTEXT)).toBe('Bugs ouverts');
  });

  it('donne le nom du projet filtré, ou « Projet » s’il a disparu', () => {
    expect(listTitle(null, withFilters({ projectId: ID }), CONTEXT)).toBe('Leon');
    expect(listTitle(null, withFilters({ projectId: ID }), { ...CONTEXT, projects: [] })).toBe(
      'Projet',
    );
  });

  it('donne « Mes tâches » pour les assignées et les créées', () => {
    expect(listTitle(null, withFilters({ assignee: 'me' }), CONTEXT)).toBe('Mes tâches');
    expect(listTitle(null, withFilters({ creator: 'me' }), CONTEXT)).toBe('Mes tâches');
  });
});
