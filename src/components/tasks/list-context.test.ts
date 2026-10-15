import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { groupStatuses } from './list-context';

const STATUSES = [
  {
    id: 's1',
    projectId: 'p1',
    label: 'Backlog',
    color: '#9ca3af',
    category: 'backlog',
    position: 0,
  },
  {
    id: 's2',
    projectId: 'p2',
    label: 'Backlog',
    color: '#9ca3af',
    category: 'backlog',
    position: 0,
  },
] as const;
const ONE = [{ id: 'p1', key: 'LEO', name: 'Leon' }];
const TWO = [...ONE, { id: 'p2', key: 'ATE', name: 'Atelier' }];

describe('groupStatuses', () => {
  it('garde les libellés avec un seul projet', () => {
    expect(groupStatuses(STATUSES, ONE, DEFAULT_VIEW_CONFIG).map((s) => s.label)).toEqual([
      'Backlog',
      'Backlog',
    ]);
  });

  it('ajoute la clé du projet quand il y en a plusieurs', () => {
    expect(groupStatuses(STATUSES, TWO, DEFAULT_VIEW_CONFIG).map((s) => s.label)).toEqual([
      'Backlog · LEO',
      'Backlog · ATE',
    ]);
  });

  it('ne garde que les statuts du projet filtré, avec leurs libellés', () => {
    const config = {
      ...DEFAULT_VIEW_CONFIG,
      filters: { ...DEFAULT_VIEW_CONFIG.filters, projectId: 'p1' },
    };
    const kept = groupStatuses(STATUSES, TWO, config);
    expect(kept.map((s) => [s.id, s.label])).toEqual([['s1', 'Backlog']]);
  });
});
