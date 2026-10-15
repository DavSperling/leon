import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { myTasksTab } from './my-tasks-tabs';

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
