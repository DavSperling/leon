import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { activeFilters } from './filter-chips';

const ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const CONTEXT = {
  statuses: [],
  members: [{ id: ID, name: 'Marie Durand', initials: 'MD' }],
  labels: [{ id: ID, name: 'Bug', color: '#dc2626' }],
  projects: [{ id: ID, key: 'LEO', name: 'Leon' }],
};
const withFilters = (filters: Partial<ViewConfig['filters']>): ViewConfig => ({
  ...DEFAULT_VIEW_CONFIG,
  filters: {
    statuses: [],
    priority: null,
    assignee: null,
    creator: null,
    labelId: null,
    projectId: null,
    due: null,
    q: '',
    ...filters,
  },
});

describe('activeFilters', () => {
  it('rend le filtre de statut par défaut, retirable', () => {
    expect(activeFilters(DEFAULT_VIEW_CONFIG, CONTEXT)).toEqual([
      { id: 'statuses', label: 'Statut : Backlog, À faire, En cours', clear: { statuses: [] } },
    ]);
  });

  it('ne rend rien quand aucun filtre n’est posé', () => {
    expect(activeFilters(withFilters({}), CONTEXT)).toEqual([]);
  });

  it('nomme chaque critère et donne le changement qui le retire', () => {
    const chips = activeFilters(
      withFilters({
        priority: 'high',
        assignee: ID,
        creator: 'me',
        labelId: ID,
        projectId: ID,
        due: 'overdue',
        q: ' lenteur ',
      }),
      CONTEXT,
    );
    expect(chips.map((chip) => chip.label)).toEqual([
      'Priorité : Haute',
      'Assigné : Marie Durand',
      'Créateur : moi',
      'Étiquette : Bug',
      'Projet : Leon',
      'Échéance : En retard',
      'Texte : « lenteur »',
    ]);
    expect(chips.map((chip) => chip.clear)).toEqual([
      { priority: null },
      { assignee: null },
      { creator: null },
      { labelId: null },
      { projectId: null },
      { due: null },
      { q: '' },
    ]);
  });

  it('nomme « moi » et « sans assigné », et « Inconnu » une valeur supprimée', () => {
    const label = (assignee: string) => activeFilters(withFilters({ assignee }), CONTEXT)[0]?.label;
    expect(label('me')).toBe('Assigné : Moi');
    expect(label('none')).toBe('Assigné : Sans assigné');
    expect(label('9d1c6b3e-0000-4000-8000-000000000000')).toBe('Assigné : Inconnu');
  });
});
