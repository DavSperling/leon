import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { seedTasksScenario, type TasksScenario } from '@/test/tasks-scenario';
import { createProject } from './projects';
import { type Breakdown, countBreakdown, countOpenByProject, listTasks } from './task-list';
import type { TaskRow } from './task-row';
import { createTask, type TaskInput } from './tasks';

// Mercredi 14 octobre 2026, 12 h à Paris : la semaine va du 12 au 18, « en retard » jusqu'au 13.
const NOW = new Date('2026-10-14T10:00:00Z');
// Le même jour une heure et demie après minuit à Paris : il est déjà le 15.
const AFTER_MIDNIGHT = new Date('2026-10-14T22:30:00Z');

const ALL = [
  'ATE-1',
  'ATE-2',
  'ATE-3',
  'ATE-4',
  'ATE-5',
  'ATE-6',
  'ATE-7',
  'ATE-8',
  'ATE-9',
  'OPS-1',
];

// Les filtres de statut sont vides par défaut : chaque test n'active que ce qu'il vérifie.
function view(
  filters: Partial<ViewConfig['filters']> = {},
  settings: Partial<Omit<ViewConfig, 'filters'>> = {},
): ViewConfig {
  return {
    ...DEFAULT_VIEW_CONFIG,
    ...settings,
    filters: { ...DEFAULT_VIEW_CONFIG.filters, statuses: [], ...filters },
  };
}

const refsOf = (rows: readonly TaskRow[]): string[] => rows.map((row) => row.ref).sort();

type Seed = TasksScenario & { opsProjectId: string };

// Dix tâches pour Paul et Marie (un projet de plus pour OPS-1) ; ATE-9 est la sous-tâche d'ATE-1.
//   ATE-1 Paul, haute, échue le 13, Bug ; ATE-2 Marie, moyenne, le 14, Bug et Fonctionnalité ;
//   ATE-3 Paul, urgente, le 18 ; ATE-4 et ATE-5 sans assigné (ATE-5 : basse, Amélioration) ;
//   ATE-6 créée et assignée par Marie ; ATE-7 terminée (le 1er) ; ATE-8 annulée (le 19).
async function seedList(): Promise<Seed> {
  const scenario = await seedTasksScenario();
  const { paul, marie, projectId, status, label } = scenario;
  const byPaul = { kind: 'user', userId: paul.userId } as const;
  const byMarie = { kind: 'user', userId: marie.userId } as const;
  const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
  const byPaulInputs: TaskInput[] = [
    {
      title: 'Commander le bois',
      priority: 'high',
      assigneeId: paul.userId,
      dueDate: '2026-10-13',
      labelIds: [label.Bug],
    },
    {
      title: 'Remise à 100% des plans',
      statusId: status['À faire'],
      priority: 'medium',
      assigneeId: marie.userId,
      dueDate: '2026-10-14',
      labelIds: [label.Bug, label.Fonctionnalité],
    },
    {
      title: 'Plan_A',
      statusId: status['En cours'],
      priority: 'urgent',
      assigneeId: paul.userId,
      dueDate: '2026-10-18',
    },
    { title: 'Plan B' },
    {
      title: 'Lot 1000 pièces',
      statusId: status['À faire'],
      priority: 'low',
      labelIds: [label.Amélioration],
    },
  ];
  const created = [];
  for (const input of byPaulInputs) {
    created.push(await createTask(paul, { projectId, ...input }, byPaul));
  }
  await createTask(
    marie,
    { projectId, title: 'Dossier C:\\plans', assigneeId: marie.userId },
    byMarie,
  );
  await createTask(
    marie,
    { projectId, title: 'Livrer le chantier', statusId: status.Terminé, dueDate: '2026-10-01' },
    byMarie,
  );
  await createTask(
    paul,
    { projectId, title: 'Abandonner', statusId: status.Annulé, dueDate: '2026-10-19' },
    byPaul,
  );
  await createTask(paul, { title: 'Mesurer', parentId: created[0]?.id }, byPaul);
  await createTask(paul, { projectId: ops.id, title: 'Réunion fournisseurs' }, byPaul);
  return { ...scenario, opsProjectId: ops.id };
}

let seed: Seed;
beforeAll(async () => {
  seed = await seedList();
});

describe('listTasks : filtres', () => {
  it('rend toutes les tâches visibles sans filtre, aucune masquée', async () => {
    const result = await listTasks(seed.paul, view(), NOW);

    expect(refsOf(result.rows)).toEqual(ALL);
    expect(result.hiddenCount).toBe(0);
  });

  it('ne garde par défaut que les tâches ni terminées ni annulées et compte les autres', async () => {
    const result = await listTasks(seed.paul, DEFAULT_VIEW_CONFIG, NOW);

    expect(refsOf(result.rows)).toEqual(ALL.filter((ref) => !['ATE-7', 'ATE-8'].includes(ref)));
    expect(result.hiddenCount).toBe(2);
  });

  it('filtre sur les catégories de statut', async () => {
    const result = await listTasks(seed.paul, view({ statuses: ['done', 'canceled'] }), NOW);

    expect(refsOf(result.rows)).toEqual(['ATE-7', 'ATE-8']);
    expect(result.hiddenCount).toBe(8);
  });

  it('filtre sur la priorité (la sous-tâche a hérité de celle de son parent)', async () => {
    const result = await listTasks(seed.paul, view({ priority: 'high' }), NOW);

    expect(refsOf(result.rows)).toEqual(['ATE-1', 'ATE-9']);
  });

  it('filtre sur l’assigné : moi (celui qui regarde), aucun, une personne', async () => {
    const { paul, marie } = seed;

    const mineForPaul = await listTasks(paul, view({ assignee: 'me' }), NOW);
    const mineForMarie = await listTasks(marie, view({ assignee: 'me' }), NOW);
    const unassigned = await listTasks(paul, view({ assignee: 'none' }), NOW);
    const maries = await listTasks(paul, view({ assignee: marie.userId }), NOW);

    expect(refsOf(mineForPaul.rows)).toEqual(['ATE-1', 'ATE-3']);
    expect(refsOf(mineForMarie.rows)).toEqual(['ATE-2', 'ATE-6']);
    expect(refsOf(unassigned.rows)).toEqual(['ATE-4', 'ATE-5', 'ATE-7', 'ATE-8', 'ATE-9', 'OPS-1']);
    expect(refsOf(maries.rows)).toEqual(['ATE-2', 'ATE-6']);
  });

  it('filtre sur le créateur : moi', async () => {
    const { paul, marie } = seed;

    const createdByMarie = await listTasks(marie, view({ creator: 'me' }), NOW);
    const createdByPaul = await listTasks(paul, view({ creator: 'me' }), NOW);

    expect(refsOf(createdByMarie.rows)).toEqual(['ATE-6', 'ATE-7']);
    expect(refsOf(createdByPaul.rows)).toEqual(
      ALL.filter((ref) => !['ATE-6', 'ATE-7'].includes(ref)),
    );
  });

  it('filtre sur une étiquette, une tâche à deux étiquettes y figure', async () => {
    const { paul, label } = seed;

    const bugs = await listTasks(paul, view({ labelId: label.Bug }), NOW);
    const features = await listTasks(paul, view({ labelId: label.Fonctionnalité }), NOW);

    expect(refsOf(bugs.rows)).toEqual(['ATE-1', 'ATE-2']);
    expect(refsOf(features.rows)).toEqual(['ATE-2']);
  });

  it('filtre sur un projet', async () => {
    const { paul, projectId, opsProjectId } = seed;

    const ops = await listTasks(paul, view({ projectId: opsProjectId }), NOW);
    const atelier = await listTasks(paul, view({ projectId }), NOW);

    expect(refsOf(ops.rows)).toEqual(['OPS-1']);
    expect(refsOf(atelier.rows)).toEqual(ALL.filter((ref) => ref !== 'OPS-1'));
    expect(ops.hiddenCount).toBe(9);
  });

  it('filtre sur l’échéance à une date fixée, jour courant compris', async () => {
    const { paul } = seed;

    const overdue = await listTasks(paul, view({ due: 'overdue' }), NOW);
    const week = await listTasks(paul, view({ due: 'week' }), NOW);
    const none = await listTasks(paul, view({ due: 'none' }), NOW);

    expect(refsOf(overdue.rows)).toEqual(['ATE-1', 'ATE-7']);
    expect(refsOf(week.rows)).toEqual(['ATE-1', 'ATE-2', 'ATE-3']);
    expect(refsOf(none.rows)).toEqual(['ATE-4', 'ATE-5', 'ATE-6', 'ATE-9', 'OPS-1']);
  });

  it('compte « aujourd’hui » à Paris : après minuit, le 14 est en retard', async () => {
    const overdue = await listTasks(seed.paul, view({ due: 'overdue' }), AFTER_MIDNIGHT);

    expect(refsOf(overdue.rows)).toEqual(['ATE-1', 'ATE-2', 'ATE-7']);
  });

  it('combine les filtres (ET)', async () => {
    const { paul } = seed;

    const result = await listTasks(
      paul,
      { ...DEFAULT_VIEW_CONFIG, filters: { ...DEFAULT_VIEW_CONFIG.filters, assignee: 'me' } },
      NOW,
    );

    expect(refsOf(result.rows)).toEqual(['ATE-1', 'ATE-3']);
    expect(result.hiddenCount).toBe(8);
  });

  it('masque les sous-tâches quand l’affichage le demande, et les compte', async () => {
    const result = await listTasks(seed.paul, view({}, { showSubtasks: false }), NOW);

    expect(refsOf(result.rows)).toEqual(ALL.filter((ref) => ref !== 'ATE-9'));
    expect(result.hiddenCount).toBe(1);
  });
});

describe('listTasks : texte', () => {
  const search = async (q: string) => refsOf((await listTasks(seed.paul, view({ q }), NOW)).rows);

  it('cherche dans le titre sans tenir compte de la casse', async () => {
    expect(await search('BOIS')).toEqual(['ATE-1']);
  });

  it('prend % tel quel : « 100% » ne trouve pas « 1000 pièces »', async () => {
    expect(await search('100%')).toEqual(['ATE-2']);
  });

  it('prend _ tel quel : « n_ » ne trouve que « Plan_A »', async () => {
    expect(await search('n_')).toEqual(['ATE-3']);
  });

  it('prend \\ tel quel', async () => {
    expect(await search('C:\\plans')).toEqual(['ATE-6']);
  });

  it('cherche aussi l’identifiant, en minuscules comme en capitales', async () => {
    expect(await search('ate-3')).toEqual(['ATE-3']);
    expect(await search('OPS-1')).toEqual(['OPS-1']);
  });

  it('ignore un texte fait d’espaces', async () => {
    expect(await search('   ')).toEqual(ALL);
  });

  it('se combine avec les autres filtres', async () => {
    const result = await listTasks(seed.paul, view({ q: 'plan', assignee: 'me' }), NOW);

    expect(refsOf(result.rows)).toEqual(['ATE-3']);
  });
});

describe('listTasks : contenu des lignes', () => {
  it('rend les étiquettes, le parent et le compte des sous-tâches', async () => {
    const result = await listTasks(seed.paul, view(), NOW);

    const parent = result.rows.find((row) => row.ref === 'ATE-1');
    const child = result.rows.find((row) => row.ref === 'ATE-9');
    expect(parent).toMatchObject({
      title: 'Commander le bois',
      statusLabel: 'Backlog',
      assignee: { name: 'Paul Martin', initials: 'PM' },
      labels: [{ name: 'Bug' }],
      subtaskCount: 1,
      parentRef: null,
    });
    expect(child).toMatchObject({ parentRef: 'ATE-1', subtaskCount: 0 });
  });
});

// Le même décompte, refait à la main sur les lignes de listTasks.
function tally(keys: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key ?? 'none', (counts.get(key ?? 'none') ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

const sortedPairs = (pairs: [string, number][]) => pairs.sort(([a], [b]) => a.localeCompare(b));

const normalized = (breakdown: Breakdown) => ({
  assignee: sortedPairs(breakdown.assignee.map((e) => [e.id ?? 'none', e.count])),
  label: sortedPairs(breakdown.label.map((e) => [e.id, e.count])),
  priority: sortedPairs(breakdown.priority.map((e) => [e.value, e.count])),
  project: sortedPairs(breakdown.project.map((e) => [e.id, e.count])),
});

const expectedFrom = (rows: readonly TaskRow[]) => ({
  assignee: tally(rows.map((row) => row.assignee?.id ?? null)),
  label: tally(rows.flatMap((row) => row.labels.map((label) => label.id))),
  priority: tally(rows.map((row) => row.priority)),
  project: tally(rows.map((row) => row.projectId)),
});

describe('countBreakdown', () => {
  it('compte les mêmes tâches que listTasks, quelle que soit la vue', async () => {
    const { paul, marie, label } = seed;
    const cases = [
      { ctx: paul, config: view() },
      { ctx: paul, config: DEFAULT_VIEW_CONFIG },
      { ctx: marie, config: view({ assignee: 'me' }) },
      { ctx: paul, config: view({ labelId: label.Bug }) },
      { ctx: paul, config: view({ q: 'plan' }) },
      { ctx: paul, config: view({ due: 'week' }, { showSubtasks: false }) },
      { ctx: paul, config: view({ priority: 'high', statuses: ['backlog'] }) },
    ];

    for (const { ctx, config } of cases) {
      const { rows } = await listTasks(ctx, config, NOW);
      expect(normalized(await countBreakdown(ctx, config, NOW))).toEqual(expectedFrom(rows));
    }
  });

  it('range les valeurs : les plus nombreuses d’abord, les priorités dans l’ordre de tri', async () => {
    const breakdown = await countBreakdown(seed.paul, view(), NOW);

    expect(breakdown.assignee[0]).toEqual({ id: null, count: 6 });
    expect(breakdown.priority.map((entry) => entry.value)).toEqual([
      'urgent',
      'high',
      'medium',
      'low',
      'none',
    ]);
    expect(breakdown.label.map((entry) => entry.count)).toEqual([2, 1, 1]);
  });
});

describe('countOpenByProject', () => {
  it('compte les tâches ouvertes de chaque projet', async () => {
    const { paul, projectId, opsProjectId } = seed;

    expect(await countOpenByProject(paul)).toEqual({ [projectId]: 7, [opsProjectId]: 1 });
  });
});

describe('listes : une autre organisation', () => {
  it('ne voit aucune tâche, ne compte rien', async () => {
    const { zoe } = seed;

    expect(await listTasks(zoe, view(), NOW)).toEqual({ rows: [], hiddenCount: 0 });
    expect(await countBreakdown(zoe, view(), NOW)).toEqual({
      assignee: [],
      label: [],
      priority: [],
      project: [],
    });
    expect(await countOpenByProject(zoe)).toEqual({});
  });
});
