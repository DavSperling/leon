import { eq, type SQL, sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { TASK_STATUS_CATEGORIES } from '@/lib/enums';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import type { TenantContext } from '@/server/auth/tenant-context';
import * as tasksSchema from '@/server/db/schema/tasks';
import {
  taskComments,
  taskEvents,
  taskLabelLinks,
  taskLabels,
  taskProjects,
  taskStatuses,
  tasks,
  taskViews,
} from '@/server/db/schema/tasks';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedTask, seedTaskLabel, seedTaskProject } from '@/test/fixtures';

// Droits des tâches (0007-taches.sql), scénario Paul / Marie / Zoé : Paul et Marie partagent une
// organisation, Zoé est dans une autre.

const DENIED = { cause: { code: '42501' } };
const FOREIGN_KEY = { cause: { code: '23503' } };
const CHECK = { cause: { code: '23514' } };
const UNIQUE = { cause: { code: '23505' } };

type SeededProject = Awaited<ReturnType<typeof seedTaskProject>>;

type Ids = {
  project: string;
  todo: string;
  otherProjectTodo: string;
  privateProject: string;
  task: string;
  privateTask: string;
  label: string;
  privateLabel: string;
  comment: string;
  event: string;
  teamView: string;
  paulView: string;
};

let paul: TenantContext;
let marie: TenantContext;
let zoe: TenantContext;
let ids: Ids;

function firstId(rows: Array<{ id: string }>): string {
  const [row] = rows;
  if (!row) throw new Error('ligne de test non créée');
  return row.id;
}

async function insertComment(ctx: TenantContext, taskId: string, authorId = ctx.userId) {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .insert(taskComments)
      .values({ tenantId: ctx.tenantId, taskId, authorId, bodyMd: 'Commentaire de test.' })
      .returning({ id: taskComments.id }),
  );
  return firstId(rows);
}

async function insertEvent(
  ctx: TenantContext,
  taskId: string,
  actorId: string | null = ctx.userId,
) {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .insert(taskEvents)
      .values({ tenantId: ctx.tenantId, taskId, actorId, actorKind: 'user', kind: 'comment' })
      .returning({ id: taskEvents.id }),
  );
  return firstId(rows);
}

function insertLink(ctx: TenantContext, taskId: string, labelId: string) {
  return withTenant(ctx, (tx) =>
    tx.insert(taskLabelLinks).values({ tenantId: ctx.tenantId, taskId, labelId }),
  );
}

async function insertView(
  ctx: TenantContext,
  input: { acl: string[]; ownerId?: string; isTeamDefault?: boolean },
) {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .insert(taskViews)
      .values({
        tenantId: ctx.tenantId,
        ownerId: input.ownerId ?? ctx.userId,
        name: 'Vue de test',
        config: DEFAULT_VIEW_CONFIG,
        isTeamDefault: input.isTeamDefault ?? false,
        acl: input.acl,
      })
      .returning({ id: taskViews.id }),
  );
  return firstId(rows);
}

async function takeNumber(tx: Tx, projectId: string): Promise<number> {
  const [project] = await tx
    .update(taskProjects)
    .set({ lastNumber: sql`${taskProjects.lastNumber} + 1` })
    .where(eq(taskProjects.id, projectId))
    .returning({ number: taskProjects.lastNumber });
  if (!project) throw new Error('projet de test invisible');
  return project.number;
}

// Une tâche insérée comme le fait createTask : numéro pris au compteur dans la même transaction
// (sauf numéro imposé), créateur = soi ; `overrides` remplace le reste.
async function insertTask(
  ctx: TenantContext,
  project: SeededProject,
  overrides: Partial<typeof tasks.$inferInsert> = {},
) {
  const [row] = await withTenant(ctx, async (tx) =>
    tx
      .insert(tasks)
      .values({
        tenantId: ctx.tenantId,
        projectId: project.projectId,
        number: overrides.number ?? (await takeNumber(tx, project.projectId)),
        statusId: project.statusIds.todo,
        creatorId: ctx.userId,
        title: 'Tâche de test',
        position: 0,
        origin: 'ui',
        acl: [ctx.tenantId],
        ...overrides,
      })
      .returning({ id: tasks.id, number: tasks.number, acl: tasks.acl }),
  );
  if (!row) throw new Error('tâche de test non créée');
  return row;
}

// Un projet d'équipe avec une tâche étiquetée, commentée et journalisée, un second projet, un projet
// et une étiquette privés de Paul, la vue d'équipe par défaut et une vue privée de Paul.
async function seedTeamTasks(ctx: TenantContext): Promise<Ids> {
  const leo = await seedTaskProject(ctx.tenantId, { key: 'LEO' });
  const ops = await seedTaskProject(ctx.tenantId, { key: 'OPS' });
  const secret = await seedTaskProject(ctx.tenantId, { key: 'PRIV', acl: [ctx.userId] });
  const task = await seedTask({
    projectId: leo.projectId,
    statusId: leo.statusIds.todo,
    creatorId: ctx.userId,
  });
  const label = await seedTaskLabel(ctx.tenantId, { name: 'Bug' });
  await insertLink(ctx, task, label);
  return {
    project: leo.projectId,
    todo: leo.statusIds.todo,
    otherProjectTodo: ops.statusIds.todo,
    privateProject: secret.projectId,
    task,
    privateTask: await seedTask({
      projectId: secret.projectId,
      statusId: secret.statusIds.todo,
      creatorId: ctx.userId,
    }),
    label,
    privateLabel: await seedTaskLabel(ctx.tenantId, { name: 'Perso', acl: [ctx.userId] }),
    comment: await insertComment(ctx, task),
    event: await insertEvent(ctx, task),
    teamView: await insertView(ctx, { acl: [ctx.tenantId], isTeamDefault: true }),
    paulView: await insertView(ctx, { acl: [ctx.userId] }),
  };
}

beforeAll(async () => {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [p, m] = team.members;
  const [z] = other.members;
  if (!p || !m || !z) throw new Error('membres du scénario non créés');
  [paul, marie, zoe] = [p, m, z];
  ids = await seedTeamTasks(paul);
});

// Pour chaque table : une ligne de Paul et Marie, une colonne que leon_app peut modifier
// (null : aucune) et s'il peut supprimer.
type TableCase = { table: PgTable; row: () => SQL; updatable: string | null; deletable: boolean };

const TABLES: Record<string, TableCase> = {
  task_projects: {
    table: taskProjects,
    row: () => eq(taskProjects.id, ids.project),
    updatable: 'name',
    deletable: false,
  },
  task_statuses: {
    table: taskStatuses,
    row: () => eq(taskStatuses.id, ids.todo),
    updatable: 'label',
    deletable: true,
  },
  tasks: { table: tasks, row: () => eq(tasks.id, ids.task), updatable: 'title', deletable: true },
  task_labels: {
    table: taskLabels,
    row: () => eq(taskLabels.id, ids.label),
    updatable: 'name',
    deletable: true,
  },
  task_label_links: {
    table: taskLabelLinks,
    row: () => eq(taskLabelLinks.taskId, ids.task),
    updatable: null,
    deletable: true,
  },
  task_comments: {
    table: taskComments,
    row: () => eq(taskComments.id, ids.comment),
    updatable: null,
    deletable: false,
  },
  task_events: {
    table: taskEvents,
    row: () => eq(taskEvents.id, ids.event),
    updatable: null,
    deletable: false,
  },
  task_views: {
    table: taskViews,
    row: () => eq(taskViews.id, ids.teamView),
    updatable: 'name',
    deletable: true,
  },
};

const UPDATABLE = Object.entries(TABLES).flatMap(([name, { table, row, updatable }]) =>
  updatable ? [[name, table, row, updatable] as const] : [],
);
const DELETABLE = Object.entries(TABLES).filter(([, { deletable }]) => deletable);

// Une ligne valide par table, dans l'organisation de Paul et Marie.
const TEAM_INSERTS: Record<string, (tx: Tx) => Promise<unknown>> = {
  task_projects: (tx) =>
    tx
      .insert(taskProjects)
      .values({ tenantId: paul.tenantId, key: 'ZOE', name: 'Zoé', acl: [paul.tenantId] }),
  task_statuses: (tx) =>
    tx.insert(taskStatuses).values({
      tenantId: paul.tenantId,
      projectId: ids.project,
      label: 'Glissé',
      color: '#000000',
      category: 'todo',
      position: 99,
    }),
  tasks: (tx) =>
    tx.insert(tasks).values({
      tenantId: paul.tenantId,
      projectId: ids.project,
      number: 999,
      statusId: ids.todo,
      creatorId: zoe.userId,
      title: 'Tâche glissée',
      position: 0,
      origin: 'ui',
      acl: [paul.tenantId],
    }),
  task_labels: (tx) =>
    tx
      .insert(taskLabels)
      .values({ tenantId: paul.tenantId, name: 'Glissée', color: '#000000', acl: [paul.tenantId] }),
  // paire encore absente : seule la RLS peut refuser
  task_label_links: (tx) =>
    tx
      .insert(taskLabelLinks)
      .values({ tenantId: paul.tenantId, taskId: ids.privateTask, labelId: ids.label }),
  task_comments: (tx) =>
    tx.insert(taskComments).values({
      tenantId: paul.tenantId,
      taskId: ids.task,
      authorId: zoe.userId,
      bodyMd: 'Glissé',
    }),
  task_events: (tx) =>
    tx.insert(taskEvents).values({
      tenantId: paul.tenantId,
      taskId: ids.task,
      actorId: zoe.userId,
      actorKind: 'user',
      kind: 'comment',
    }),
  task_views: (tx) =>
    tx.insert(taskViews).values({
      tenantId: paul.tenantId,
      ownerId: zoe.userId,
      name: 'Vue glissée',
      config: DEFAULT_VIEW_CONFIG,
      acl: [paul.tenantId],
    }),
};

describe('droits de leon_app sur les tâches', () => {
  it('le tableau couvre toutes les tables des tâches', () => {
    const names = Object.values(tasksSchema).map((table) => getTableConfig(table).name);
    expect(Object.keys(TABLES).sort()).toEqual(names.sort());
    expect(Object.keys(TEAM_INSERTS).sort()).toEqual(names.sort());
  });

  it.each(Object.entries(TABLES))(
    '%s : RLS active, modification et suppression au plus juste, ni truncate',
    async (name, { updatable, deletable }) => {
      const { rows } = await adminPool.query(
        `select relrowsecurity as rls,
                has_any_column_privilege('leon_app', $1, 'UPDATE') as can_update,
                has_table_privilege('leon_app', $1, 'DELETE') as can_delete,
                has_table_privilege('leon_app', $1, 'TRUNCATE') as can_truncate
           from pg_class where relname = $1 and relkind = 'r'`,
        [name],
      );
      expect(rows).toEqual([
        { rls: true, can_update: updatable !== null, can_delete: deletable, can_truncate: false },
      ]);
    },
  );

  it("aucune table n'ouvre la modification de l'organisation, de l'ACL ni de l'auteur", async () => {
    const { rows } = await adminPool.query(
      `select table_name, column_name
         from information_schema.column_privileges
        where grantee = 'leon_app' and privilege_type = 'UPDATE' and table_schema = 'public'
          and table_name = any($1) and column_name = any($2)
        order by 1, 2`,
      [
        Object.keys(TABLES),
        ['id', 'tenant_id', 'acl', 'owner_id', 'creator_id', 'author_id', 'actor_id', 'origin'],
      ],
    );
    expect(rows).toEqual([]);
  });

  it.each(['acl', 'tenant_id', 'creator_id', 'origin'])(
    'refuse de modifier tasks.%s : 42501',
    async (name) => {
      const column = sql.identifier(name);
      const update = withTenant(paul, (tx) =>
        tx.execute(sql`update ${tasks} set ${column} = ${column} where ${tasks.id} = ${ids.task}`),
      );
      await expect(update).rejects.toMatchObject(DENIED);
    },
  );

  it('refuse de supprimer un projet : 42501', async () => {
    const remove = withTenant(paul, (tx) =>
      tx.delete(taskProjects).where(eq(taskProjects.id, ids.project)),
    );
    await expect(remove).rejects.toMatchObject(DENIED);
  });

  it('refuse de modifier ou de supprimer le journal : 42501', async () => {
    const event = eq(taskEvents.id, ids.event);
    const update = withTenant(paul, (tx) =>
      tx.update(taskEvents).set({ kind: 'title' }).where(event),
    );
    await expect(update).rejects.toMatchObject(DENIED);
    await expect(
      withTenant(paul, (tx) => tx.delete(taskEvents).where(event)),
    ).rejects.toMatchObject(DENIED);
  });
});

describe("Zoé, d'une autre organisation", () => {
  it.each(Object.entries(TABLES))('ne lit pas %s, que Paul lit', async (_name, { table, row }) => {
    expect(await withTenant(zoe, (tx) => tx.$count(table, row()))).toBe(0);
    expect(await withTenant(paul, (tx) => tx.$count(table, row()))).toBe(1);
  });

  it.each(UPDATABLE)('ne modifie aucune ligne de %s', async (_name, table, row, updatable) => {
    const column = sql.identifier(updatable);
    const result = await withTenant(zoe, (tx) =>
      tx.execute(sql`update ${table} set ${column} = ${column} where ${row()}`),
    );
    expect(result.rowCount).toBe(0);
  });

  it.each(DELETABLE)('ne supprime aucune ligne de %s', async (_name, { table, row }) => {
    const result = await withTenant(zoe, (tx) =>
      tx.execute(sql`delete from ${table} where ${row()}`),
    );
    expect(result.rowCount).toBe(0);
    expect(await adminDb.$count(table, row())).toBe(1);
  });

  it.each(Object.entries(TEAM_INSERTS))(
    "n'insère aucune ligne de %s chez Paul et Marie : 42501",
    async (_name, insert) => {
      await expect(withTenant(zoe, insert)).rejects.toMatchObject(DENIED);
    },
  );
});

describe('rattachement à une tâche ou une étiquette invisible', () => {
  it.each([
    ['un commentaire', (ctx: TenantContext, taskId: string) => insertComment(ctx, taskId)],
    ['un événement', (ctx: TenantContext, taskId: string) => insertEvent(ctx, taskId)],
    [
      "un lien d'étiquette",
      (ctx: TenantContext, taskId: string) => insertLink(ctx, taskId, ids.label),
    ],
  ])(
    '%s ne vise ni la tâche privée de Paul (Marie) ni une tâche de Paul et Marie (Zoé) : 42501',
    async (_kind, insert) => {
      await expect(insert(marie, ids.privateTask)).rejects.toMatchObject(DENIED);
      await expect(insert(zoe, ids.task)).rejects.toMatchObject(DENIED);
    },
  );

  it("un lien ne vise pas l'étiquette privée de Paul : 42501", async () => {
    await expect(insertLink(marie, ids.task, ids.privateLabel)).rejects.toMatchObject(DENIED);
  });
});

describe('lecture de ce qui se rattache au projet privé de Paul', () => {
  it('Marie ne lit ni ses statuts, ni les commentaires, le journal et les étiquettes de sa tâche', async () => {
    const label = await seedTaskLabel(paul.tenantId, { name: 'Sur tâche privée' });
    await insertLink(paul, ids.privateTask, label);
    await insertComment(paul, ids.privateTask);
    await insertEvent(paul, ids.privateTask);
    const counts = (ctx: TenantContext) =>
      withTenant(ctx, async (tx) => ({
        statuses: await tx.$count(taskStatuses, eq(taskStatuses.projectId, ids.privateProject)),
        links: await tx.$count(taskLabelLinks, eq(taskLabelLinks.taskId, ids.privateTask)),
        comments: await tx.$count(taskComments, eq(taskComments.taskId, ids.privateTask)),
        events: await tx.$count(taskEvents, eq(taskEvents.taskId, ids.privateTask)),
      }));
    expect(await counts(paul)).toEqual({
      statuses: TASK_STATUS_CATEGORIES.length,
      links: 1,
      comments: 1,
      events: 1,
    });
    expect(await counts(marie)).toEqual({ statuses: 0, links: 0, comments: 0, events: 0 });
  });
});

describe('auteur des commentaires et du journal', () => {
  it('Marie ne crée ni commentaire ni événement au nom de Paul : 42501', async () => {
    await expect(insertComment(marie, ids.task, paul.userId)).rejects.toMatchObject(DENIED);
    await expect(insertEvent(marie, ids.task, paul.userId)).rejects.toMatchObject(DENIED);
  });

  it('refuse un événement sans acteur : 42501', async () => {
    await expect(insertEvent(marie, ids.task, null)).rejects.toMatchObject(DENIED);
  });

  it('Marie commente et journalise en son nom', async () => {
    await expect(insertComment(marie, ids.task)).resolves.toEqual(expect.any(String));
    await expect(insertEvent(marie, ids.task)).resolves.toEqual(expect.any(String));
  });
});

describe('intégrité des tâches', () => {
  it("refuse le statut d'un autre projet : 23503", async () => {
    const update = withTenant(paul, (tx) =>
      tx.update(tasks).set({ statusId: ids.otherProjectTodo }).where(eq(tasks.id, ids.task)),
    );
    await expect(update).rejects.toMatchObject(FOREIGN_KEY);
  });

  it("refuse une tâche parente d'elle-même : 23514", async () => {
    const update = withTenant(paul, (tx) =>
      tx.update(tasks).set({ parentId: ids.task }).where(eq(tasks.id, ids.task)),
    );
    await expect(update).rejects.toMatchObject(CHECK);
  });

  it('supprimer le parent met parent_id à nul', async () => {
    const seed = { projectId: ids.project, statusId: ids.todo, creatorId: paul.userId };
    const parentId = await seedTask(seed);
    const childId = await seedTask({ ...seed, parentId });
    await withTenant(paul, (tx) => tx.delete(tasks).where(eq(tasks.id, parentId)));
    const rows = await adminDb
      .select({ parentId: tasks.parentId })
      .from(tasks)
      .where(eq(tasks.id, childId));
    expect(rows).toEqual([{ parentId: null }]);
  });

  it("la suppression d'une tâche emporte ses événements, commentaires et liens", async () => {
    const taskId = await seedTask({
      projectId: ids.project,
      statusId: ids.todo,
      creatorId: paul.userId,
    });
    await insertEvent(paul, taskId);
    await insertComment(paul, taskId);
    await insertLink(paul, taskId, ids.label);
    await withTenant(paul, (tx) => tx.delete(tasks).where(eq(tasks.id, taskId)));
    expect(await adminDb.$count(taskEvents, eq(taskEvents.taskId, taskId))).toBe(0);
    expect(await adminDb.$count(taskComments, eq(taskComments.taskId, taskId))).toBe(0);
    expect(await adminDb.$count(taskLabelLinks, eq(taskLabelLinks.taskId, taskId))).toBe(0);
  });
});

// Les clés étrangères ignorent la RLS : seules les clés composées (tenant_id, …) empêchent une
// tâche de Zoé de viser un statut ou un parent de Paul. Un projet de Paul, tasks_guard le lit
// sous la RLS de Zoé : invisible, il est refusé avant la clé étrangère.
describe('références vers une autre organisation', () => {
  let zoeProject: SeededProject;

  beforeAll(async () => {
    zoeProject = await seedTaskProject(zoe.tenantId, { key: 'ZOE' });
  });

  const FOREIGN_REFERENCES: Array<[string, () => Partial<typeof tasks.$inferInsert>]> = [
    ['un statut', () => ({ statusId: ids.todo })],
    ['un parent', () => ({ parentId: ids.task })],
  ];

  it.each(FOREIGN_REFERENCES)(
    "tasks refuse %s de l'organisation de Paul : 23503",
    async (_kind, overrides) => {
      await expect(insertTask(zoe, zoeProject, overrides())).rejects.toMatchObject(FOREIGN_KEY);
    },
  );

  it("tasks refuse un projet de l'organisation de Paul : 42501", async () => {
    const insert = insertTask(zoe, zoeProject, { projectId: ids.project, statusId: ids.todo });
    await expect(insert).rejects.toMatchObject(DENIED);
  });

  // sans référence étrangère, la même tâche passe : seule la clé étrangère refusait
  it('tasks accepte la même tâche sans référence étrangère', async () => {
    await expect(insertTask(zoe, zoeProject)).resolves.toBeDefined();
  });
});

// Ce que createTask et updateTask respectent, la base l'impose aussi : tasks_guard,
// task_projects_guard et creator_insert.
describe('numéros, ACL et créateur des tâches', () => {
  let team: SeededProject;
  let paulOnly: SeededProject;

  beforeAll(async () => {
    team = await seedTaskProject(paul.tenantId, { key: 'NUM' });
    paulOnly = await seedTaskProject(paul.tenantId, { key: 'MOI', acl: [paul.userId] });
  });

  function setCounter(value: number | SQL) {
    return withTenant(paul, (tx) =>
      tx
        .update(taskProjects)
        .set({ lastNumber: value })
        .where(eq(taskProjects.id, team.projectId))
        .returning({ lastNumber: taskProjects.lastNumber }),
    );
  }

  it('refuse de remettre le compteur à zéro ou de le pousser au maximum : 42501, accepte le pas suivant', async () => {
    const { number } = await insertTask(paul, team);
    await expect(setCounter(0)).rejects.toMatchObject(DENIED);
    await expect(setCounter(2_147_483_647)).rejects.toMatchObject(DENIED);
    await expect(setCounter(sql`${taskProjects.lastNumber} + 1`)).resolves.toEqual([
      { lastNumber: number + 1 },
    ]);
  });

  it('refuse un numéro hors du compteur, à l’insertion comme à la mise à jour : 42501', async () => {
    const task = await insertTask(paul, team);
    // le numéro que prendra la prochaine création : posé d'avance, il la bloquerait
    const next = task.number + 1;
    await expect(insertTask(paul, team, { number: next })).rejects.toMatchObject(DENIED);
    const update = withTenant(paul, (tx) =>
      tx.update(tasks).set({ number: next }).where(eq(tasks.id, task.id)),
    );
    await expect(update).rejects.toMatchObject(DENIED);
  });

  it("donne à une tâche l'ACL de son projet, quelle que soit celle posée", async () => {
    const task = await insertTask(paul, paulOnly, { acl: [paul.tenantId] });
    expect(task.acl).toEqual([paul.userId]);
    expect(await withTenant(marie, (tx) => tx.$count(tasks, eq(tasks.id, task.id)))).toBe(0);
  });

  it('Marie ne crée de tâche ni au nom de Paul ni sans créateur : 42501', async () => {
    const asPaul = insertTask(marie, team, { creatorId: paul.userId });
    await expect(asPaul).rejects.toMatchObject(DENIED);
    await expect(insertTask(marie, team, { creatorId: null })).rejects.toMatchObject(DENIED);
    await expect(insertTask(marie, team)).resolves.toBeDefined();
  });
});

describe('vues enregistrées', () => {
  it('une vue [paul] est invisible de Marie', async () => {
    const view = eq(taskViews.id, ids.paulView);
    expect(await withTenant(marie, (tx) => tx.$count(taskViews, view))).toBe(0);
    expect(await withTenant(paul, (tx) => tx.$count(taskViews, view))).toBe(1);
  });

  it("Marie voit la vue d'équipe de Paul mais ne la supprime pas", async () => {
    const view = eq(taskViews.id, ids.teamView);
    expect(await withTenant(marie, (tx) => tx.$count(taskViews, view))).toBe(1);
    const deleted = await withTenant(marie, (tx) =>
      tx.delete(taskViews).where(view).returning({ id: taskViews.id }),
    );
    expect(deleted).toEqual([]);
    expect(await adminDb.$count(taskViews, view)).toBe(1);
  });

  it("Paul supprime sa propre vue d'équipe", async () => {
    const viewId = await insertView(paul, { acl: [paul.tenantId] });
    const deleted = await withTenant(paul, (tx) =>
      tx.delete(taskViews).where(eq(taskViews.id, viewId)).returning({ id: taskViews.id }),
    );
    expect(deleted).toEqual([{ id: viewId }]);
  });

  it('Marie ne crée pas de vue au nom de Paul : 42501', async () => {
    const insert = insertView(marie, { acl: [marie.tenantId], ownerId: paul.userId });
    await expect(insert).rejects.toMatchObject(DENIED);
  });

  it("refuse un second défaut d'équipe : 23505", async () => {
    const insert = insertView(marie, { acl: [marie.tenantId], isTeamDefault: true });
    await expect(insert).rejects.toMatchObject(UNIQUE);
  });

  it("refuse un défaut d'équipe privé : 23514", async () => {
    const insert = insertView(zoe, { acl: [zoe.userId], isTeamDefault: true });
    await expect(insert).rejects.toMatchObject(CHECK);
  });
});
