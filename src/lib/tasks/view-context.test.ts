import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, sameConfig, type ViewConfig } from './view-config';
import { contextConfig, viewContextOf, viewStatus, withoutContext } from './view-context';

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

describe('withoutContext', () => {
  it('retire le projet, « Mes tâches » et la recherche, et garde le reste', () => {
    const config = {
      ...withFilters({
        projectId: ID,
        assignee: 'me',
        creator: 'me',
        q: 'lenteur',
        priority: 'high',
        statuses: ['done'],
        labelId: ID,
      }),
      layout: 'board',
    } as const;

    const base = withoutContext(config);

    expect(viewContextOf(base)).toBe('all');
    expect(base).toEqual({
      ...config,
      filters: { ...config.filters, projectId: null, assignee: null, creator: null, q: '' },
    });
  });

  it('garde un assigné désigné par son identifiant ou « sans assigné »', () => {
    expect(withoutContext(withFilters({ assignee: ID })).filters.assignee).toBe(ID);
    expect(withoutContext(withFilters({ assignee: 'none' })).filters.assignee).toBe('none');
  });

  it('laisse une configuration sans contexte telle quelle', () => {
    expect(withoutContext(DEFAULT_VIEW_CONFIG)).toEqual(DEFAULT_VIEW_CONFIG);
  });
});

describe('viewStatus', () => {
  const grouped = { ...DEFAULT_VIEW_CONFIG, groupBy: 'priority' } as const;

  it('sans vue, compare l’affichage à la liste de son contexte', () => {
    const mine = withFilters({ assignee: 'me' });

    expect(viewStatus(mine, DEFAULT_VIEW_CONFIG, null)).toMatchObject({ modified: false });
    expect(viewStatus({ ...mine, groupBy: 'none' }, DEFAULT_VIEW_CONFIG, null)).toMatchObject({
      modified: true,
      reference: mine,
    });
  });

  it('sans vue, est le défaut de l’équipe tant que seul le contexte diffère de la base', () => {
    const search = withFilters({ projectId: ID, assignee: 'me', q: 'x' });

    expect(viewStatus(DEFAULT_VIEW_CONFIG, DEFAULT_VIEW_CONFIG, null).isTeamDefault).toBe(true);
    expect(viewStatus({ ...search, groupBy: 'priority' }, grouped, null).isTeamDefault).toBe(true);
    expect(viewStatus({ ...search, groupBy: 'none' }, grouped, null).isTeamDefault).toBe(false);
    expect(viewStatus(withFilters({ priority: 'low' }), DEFAULT_VIEW_CONFIG, null)).toMatchObject({
      isTeamDefault: false,
    });
  });

  it('avec une vue, compare l’affichage à ses réglages enregistrés', () => {
    const view = { isTeamDefault: true };

    expect(viewStatus(grouped, grouped, view)).toMatchObject({
      reference: grouped,
      modified: false,
      isTeamDefault: true,
    });
    expect(viewStatus(DEFAULT_VIEW_CONFIG, grouped, view)).toMatchObject({
      modified: true,
      isTeamDefault: false,
    });
    expect(viewStatus(grouped, grouped, { isTeamDefault: false }).isTeamDefault).toBe(false);
  });
});
