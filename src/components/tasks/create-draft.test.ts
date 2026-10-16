import { describe, expect, it } from 'vitest';
import {
  defaultStatusId,
  groupPrefill,
  initialDraft,
  type ParentChoice,
  withParent,
  withProject,
} from './create-draft';
import type { ListContext } from './list-context';

const status = (
  id: string,
  projectId: string,
  category: ListContext['statuses'][number]['category'],
) => ({ id, projectId, label: id, color: '#9ca3af', category, position: 0 });

// Rangés par catégorie puis par position, comme listStatuses.
const CONTEXT: ListContext = {
  statuses: [
    status('leo-backlog', 'leo', 'backlog'),
    status('leo-todo', 'leo', 'todo'),
    status('leo-done', 'leo', 'done'),
    status('ate-todo', 'ate', 'todo'),
    status('ate-started', 'ate', 'started'),
  ],
  members: [{ id: 'marie', name: 'Marie Durand', initials: 'MD' }],
  labels: [{ id: 'bug', name: 'Bug', color: '#dc2626' }],
  projects: [
    { id: 'leo', key: 'LEO', name: 'Leon' },
    { id: 'ate', key: 'ATE', name: 'Atelier' },
  ],
  viewerId: 'paul',
};

const PARENT: ParentChoice = {
  id: 'parent-1',
  ref: 'LEO-3',
  title: 'Parent',
  projectId: 'leo',
  priority: 'high',
};

describe('defaultStatusId', () => {
  it('prend le premier backlog du projet', () => {
    expect(defaultStatusId(CONTEXT.statuses, 'leo')).toBe('leo-backlog');
  });

  it('à défaut de backlog, le premier à faire du projet', () => {
    expect(defaultStatusId(CONTEXT.statuses, 'ate')).toBe('ate-todo');
  });

  it('ne rend rien pour un projet sans statut de départ', () => {
    expect(defaultStatusId(CONTEXT.statuses, 'inconnu')).toBeUndefined();
    expect(defaultStatusId(CONTEXT.statuses, undefined)).toBeUndefined();
  });
});

describe('groupPrefill', () => {
  it('un groupe de statut vise ce statut', () => {
    expect(groupPrefill('status', 'ate-started', CONTEXT)).toEqual({ statusId: 'ate-started' });
  });

  it('un groupe de priorité vise cette priorité, y compris « sans priorité »', () => {
    expect(groupPrefill('priority', 'high', CONTEXT)).toEqual({ priority: 'high' });
    expect(groupPrefill('priority', 'none', CONTEXT)).toEqual({ priority: 'none' });
  });

  it('un groupe d’assigné vise ce membre ; « sans assigné » vise personne', () => {
    expect(groupPrefill('assignee', 'marie', CONTEXT)).toEqual({ assigneeId: 'marie' });
    expect(groupPrefill('assignee', 'none', CONTEXT)).toEqual({ assigneeId: null });
  });

  it('un groupe d’étiquette pose cette étiquette ; « sans étiquette » n’en pose aucune', () => {
    expect(groupPrefill('label', 'bug', CONTEXT)).toEqual({
      labels: [{ id: 'bug', name: 'Bug', color: '#dc2626' }],
    });
    expect(groupPrefill('label', 'none', CONTEXT)).toEqual({});
  });

  it('un groupe de projet vise ce projet', () => {
    expect(groupPrefill('project', 'ate', CONTEXT)).toEqual({ projectId: 'ate' });
  });

  it.each([
    ['status', 'other'],
    ['status', 'none'],
    ['priority', 'other'],
    ['assignee', 'disparu'],
    ['project', 'none'],
    ['none', 'all'],
  ] as const)('ne remplit rien pour le groupe %s « %s »', (groupBy, key) => {
    expect(groupPrefill(groupBy, key, CONTEXT)).toEqual({});
  });
});

describe('initialDraft', () => {
  it('sans rien : le premier projet et son statut par défaut', () => {
    expect(initialDraft({}, null, CONTEXT)).toEqual({
      projectId: 'leo',
      statusId: 'leo-backlog',
      priority: undefined,
      assigneeId: null,
      labels: [],
      dueDate: null,
      parent: null,
    });
  });

  it('prend le projet filtré par la vue', () => {
    expect(initialDraft({}, 'ate', CONTEXT)).toMatchObject({
      projectId: 'ate',
      statusId: 'ate-todo',
    });
  });

  it('un statut préremplit aussi le projet qui le porte', () => {
    expect(initialDraft({ statusId: 'ate-started' }, 'leo', CONTEXT)).toMatchObject({
      projectId: 'ate',
      statusId: 'ate-started',
    });
  });

  it('reprend priorité, assigné et étiquettes soufflés par le groupe', () => {
    const labels = [{ id: 'bug', name: 'Bug', color: '#dc2626' }];
    expect(
      initialDraft({ priority: 'urgent', assigneeId: 'marie', labels }, null, CONTEXT),
    ).toMatchObject({ priority: 'urgent', assigneeId: 'marie', labels });
  });

  it('sans aucun projet, le brouillon n’a ni projet ni statut', () => {
    expect(initialDraft({}, null, { ...CONTEXT, projects: [], statuses: [] })).toMatchObject({
      projectId: undefined,
      statusId: undefined,
    });
  });
});

describe('withProject', () => {
  const draft = initialDraft({ priority: 'low' }, null, CONTEXT);

  it('un autre projet redonne son statut par défaut et retire le parent', () => {
    const child = { ...draft, parent: PARENT };
    expect(withProject(child, 'ate', CONTEXT.statuses)).toMatchObject({
      projectId: 'ate',
      statusId: 'ate-todo',
      parent: null,
      priority: 'low',
    });
  });

  it('le même projet ne change rien', () => {
    const chosen = { ...draft, statusId: 'leo-done', parent: PARENT };
    expect(withProject(chosen, 'leo', CONTEXT.statuses)).toBe(chosen);
  });
});

describe('withParent', () => {
  it('un parent d’un autre projet amène son projet et sa priorité', () => {
    const draft = initialDraft({}, 'ate', CONTEXT);

    expect(withParent(draft, PARENT, CONTEXT.statuses)).toMatchObject({
      projectId: 'leo',
      statusId: 'leo-backlog',
      priority: 'high',
      parent: PARENT,
    });
  });

  it('garde la priorité déjà choisie plutôt que celle du parent', () => {
    const draft = initialDraft({ priority: 'low' }, null, CONTEXT);

    expect(withParent(draft, PARENT, CONTEXT.statuses).priority).toBe('low');
  });

  it('un parent du même projet garde le statut choisi', () => {
    const draft = { ...initialDraft({}, null, CONTEXT), statusId: 'leo-done' };

    expect(withParent(draft, PARENT, CONTEXT.statuses).statusId).toBe('leo-done');
  });

  it('retirer le parent ne change rien d’autre', () => {
    const draft = withParent(initialDraft({}, null, CONTEXT), PARENT, CONTEXT.statuses);

    expect(withParent(draft, null, CONTEXT.statuses)).toEqual({ ...draft, parent: null });
  });
});
