import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, sameConfig, type ViewConfig } from './view-config';
import { contextConfig, viewContextOf } from './view-context';

const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const withFilters = (filters: Partial<ViewConfig['filters']>): ViewConfig => ({
  ...DEFAULT_VIEW_CONFIG,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, ...filters },
});

describe('viewContextOf', () => {
  it('donne « Toutes » sans critère de navigation', () => {
    expect(viewContextOf(DEFAULT_VIEW_CONFIG)).toBe('all');
    expect(viewContextOf(withFilters({ assignee: ID, priority: 'high' }))).toBe('all');
  });

  it('donne « Mes tâches » pour les tâches assignées à moi ou créées par moi', () => {
    expect(viewContextOf(withFilters({ assignee: 'me' }))).toBe('mine');
    expect(viewContextOf(withFilters({ creator: 'me' }))).toBe('mine');
  });

  it('donne le projet filtré avant « Mes tâches », comme la navigation', () => {
    expect(viewContextOf(withFilters({ projectId: ID }))).toBe(`project:${ID}`);
    expect(viewContextOf(withFilters({ projectId: ID, assignee: 'me' }))).toBe(`project:${ID}`);
  });
});

describe('contextConfig', () => {
  it('est la base elle-même hors d’un contexte', () => {
    expect(contextConfig(DEFAULT_VIEW_CONFIG, DEFAULT_VIEW_CONFIG)).toEqual(DEFAULT_VIEW_CONFIG);
    const grouped = { ...DEFAULT_VIEW_CONFIG, groupBy: 'priority' } as const;
    expect(contextConfig(withFilters({ priority: 'low' }), grouped)).toEqual(grouped);
  });

  it('garde le critère de navigation sur la base, et rien de plus', () => {
    const base = { ...DEFAULT_VIEW_CONFIG, layout: 'board' } as const;
    const config = {
      ...withFilters({ assignee: 'me', priority: 'urgent' }),
      groupBy: 'none',
    } as const;

    expect(contextConfig(config, base)).toEqual({
      ...base,
      filters: { ...base.filters, assignee: 'me' },
    });
    expect(contextConfig(withFilters({ creator: 'me' }), base).filters.creator).toBe('me');
    expect(contextConfig(withFilters({ projectId: ID, assignee: 'me' }), base).filters).toEqual({
      ...base.filters,
      projectId: ID,
    });
  });

  it('ne diffère pas de la liste que la navigation ouvre', () => {
    const mine = withFilters({ assignee: 'me' });
    expect(sameConfig(mine, contextConfig(mine, DEFAULT_VIEW_CONFIG))).toBe(true);
    expect(sameConfig({ ...mine, groupBy: 'none' }, contextConfig(mine, DEFAULT_VIEW_CONFIG))).toBe(
      false,
    );
  });
});
