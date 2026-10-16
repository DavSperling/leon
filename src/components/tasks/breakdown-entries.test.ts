import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import type { Breakdown } from '@/server/tasks/task-list';
import { breakdownEntries } from './breakdown-entries';

const PAUL = '11111111-1111-4111-8111-111111111111';
const MARIE = '22222222-2222-4222-8222-222222222222';
const BUG = '33333333-3333-4333-8333-333333333333';
const LEO = '44444444-4444-4444-8444-444444444444';

const CONTEXT = {
  statuses: [],
  viewerId: PAUL,
  members: [
    { id: PAUL, name: 'Paul Martin', initials: 'PM' },
    { id: MARIE, name: 'Marie Durand', initials: 'MD' },
  ],
  labels: [{ id: BUG, name: 'Bug', color: '#dc2626' }],
  projects: [{ id: LEO, key: 'LEO', name: 'Leon' }],
};
const BREAKDOWN: Breakdown = {
  assignee: [
    { id: MARIE, count: 5 },
    { id: null, count: 2 },
    { id: PAUL, count: 1 },
  ],
  label: [{ id: BUG, count: 3 }],
  priority: [
    { value: 'high', count: 4 },
    { value: 'none', count: 4 },
  ],
  project: [{ id: LEO, count: 8 }],
};
const FILTERS = DEFAULT_VIEW_CONFIG.filters;
const entries = (filters = FILTERS) => breakdownEntries(BREAKDOWN, filters, CONTEXT);

describe('breakdownEntries', () => {
  it('garde l’ordre et les comptes du serveur, avec le nom de chaque valeur', () => {
    const { assignee, label, priority, project } = entries();
    expect(assignee.map(({ label, count }) => [label, count])).toEqual([
      ['Marie Durand', 5],
      ['Sans assigné', 2],
      ['Paul Martin', 1],
    ]);
    expect(label.map(({ label, count }) => [label, count])).toEqual([['Bug', 3]]);
    expect(priority.map(({ label }) => label)).toEqual(['Haute', 'Sans priorité']);
    expect(project.map(({ label, count }) => [label, count])).toEqual([['Leon', 8]]);
  });

  it('pose le filtre de la valeur au clic', () => {
    const { assignee, label, priority, project } = entries();
    expect(assignee.map((entry) => entry.patch)).toEqual([
      { assignee: MARIE },
      { assignee: 'none' },
      { assignee: PAUL },
    ]);
    expect(label[0]?.patch).toEqual({ labelId: BUG });
    expect(priority[0]?.patch).toEqual({ priority: 'high' });
    expect(project[0]?.patch).toEqual({ projectId: LEO });
  });

  it('retire le filtre quand la valeur est déjà celle de la vue', () => {
    const filtered = entries({
      ...FILTERS,
      assignee: MARIE,
      labelId: BUG,
      priority: 'high',
      projectId: LEO,
    });
    expect(filtered.assignee[0]).toMatchObject({ active: true, patch: { assignee: null } });
    expect(filtered.label[0]).toMatchObject({ active: true, patch: { labelId: null } });
    expect(filtered.priority[0]).toMatchObject({ active: true, patch: { priority: null } });
    expect(filtered.project[0]).toMatchObject({ active: true, patch: { projectId: null } });
    expect(filtered.priority[1]?.active).toBe(false);
  });

  it('reconnaît « moi » et « sans assigné » comme filtres actifs', () => {
    expect(entries({ ...FILTERS, assignee: 'me' }).assignee.map((e) => e.active)).toEqual([
      false,
      false,
      true,
    ]);
    expect(entries({ ...FILTERS, assignee: 'none' }).assignee.map((e) => e.active)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('nomme un assigné qui a quitté l’organisation, et saute une étiquette ou un projet disparus', () => {
    const gone = { ...BREAKDOWN, assignee: [{ id: 'parti', count: 1 }] };
    const result = breakdownEntries(gone, FILTERS, { ...CONTEXT, labels: [], projects: [] });
    expect(result.assignee[0]).toMatchObject({
      label: 'Ancien membre',
      icon: { kind: 'person', person: { name: 'Ancien membre' } },
    });
    expect(result.label).toEqual([]);
    expect(result.project).toEqual([]);
  });
});
