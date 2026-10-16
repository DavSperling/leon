import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MAX_IDS } from '@/lib/tasks/limits';
import { taskLabels } from '@/server/db/schema/tasks';
import { adminDb } from '@/test/db';
import { seedTasksScenario } from '@/test/tasks-scenario';
import { createLabel, deleteLabel, findLabelsByName, listLabels, updateLabel } from './labels';
import { createTask, getTaskByRef } from './tasks';

describe('listLabels et createLabel', () => {
  it('liste par ordre alphabétique les étiquettes de l’organisation, pas celles des autres', async () => {
    const { paul, marie, zoe } = await seedTasksScenario();

    await createLabel(paul, { name: 'Urgent client', color: '#ca8a04' });

    const names = (ctx: typeof paul) => listLabels(ctx).then((rows) => rows.map((r) => r.name));
    expect(await names(marie)).toEqual(['Amélioration', 'Bug', 'Fonctionnalité', 'Urgent client']);
    expect(await names(zoe)).toEqual(['Amélioration', 'Bug', 'Fonctionnalité']);
  });

  it('refuse un nom déjà pris, sans tenir compte de la casse, dans la même organisation seulement', async () => {
    const { paul, zoe } = await seedTasksScenario();

    await expect(createLabel(paul, { name: 'bug', color: '#dc2626' })).rejects.toMatchObject({
      code: 'conflict',
    });
    const created = await createLabel(paul, { name: 'Dette', color: '#6b7280' });
    expect(created).toEqual({ id: expect.any(String), name: 'Dette', color: '#6b7280' });
    await expect(createLabel(zoe, { name: 'Dette', color: '#6b7280' })).resolves.toBeDefined();
  });
});

describe('createLabel : champs réservés au serveur', () => {
  it('garde l’ACL d’équipe quand l’entrée en porte une autre', async () => {
    const { paul } = await seedTasksScenario();
    const input = { name: 'Intrus', color: '#6b7280', acl: [paul.userId] };

    const created = await createLabel(paul, input as never);

    const [row] = await adminDb
      .select({ acl: taskLabels.acl })
      .from(taskLabels)
      .where(eq(taskLabels.id, created.id));
    expect(row?.acl).toEqual([paul.tenantId]);
  });
});

describe('updateLabel', () => {
  it('renomme et recolore', async () => {
    const { paul, label } = await seedTasksScenario();

    await updateLabel(paul, label.Bug, { name: 'Défaut', color: '#db2777' });

    const labels = await listLabels(paul);
    expect(labels.find((l) => l.id === label.Bug)).toEqual({
      id: label.Bug,
      name: 'Défaut',
      color: '#db2777',
    });
  });

  it('refuse le nom d’une autre étiquette, sans tenir compte de la casse', async () => {
    const { paul, label } = await seedTasksScenario();

    await expect(updateLabel(paul, label.Bug, { name: 'AMÉLIORATION' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('ne fait rien sans champ ; ne touche pas l’étiquette d’une autre organisation', async () => {
    const { paul, zoe, label } = await seedTasksScenario();

    await expect(updateLabel(paul, label.Bug, {})).resolves.toBeUndefined();
    await expect(updateLabel(zoe, label.Bug, { name: 'Volée' })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await listLabels(paul)).map((l) => l.name)).toContain('Bug');
  });
});

describe('deleteLabel', () => {
  it('supprime l’étiquette et la retire des tâches', async () => {
    const { paul, projectId, label } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const { ref } = await createTask(
      paul,
      { title: 'Étiquetée', projectId, labelIds: [label.Bug, label.Fonctionnalité] },
      actor,
    );

    await deleteLabel(paul, label.Bug);

    expect((await getTaskByRef(paul, ref))?.labels.map((l) => l.name)).toEqual(['Fonctionnalité']);
    expect((await listLabels(paul)).map((l) => l.name)).not.toContain('Bug');
  });

  it('refuse une étiquette absente ou d’une autre organisation', async () => {
    const { paul, zoe, label } = await seedTasksScenario();

    await expect(deleteLabel(zoe, label.Bug)).rejects.toMatchObject({ code: 'not_found' });
    await deleteLabel(paul, label.Bug);
    await expect(deleteLabel(paul, label.Bug)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('findLabelsByName', () => {
  it('trouve les étiquettes par nom sans tenir compte de la casse, et ignore les inconnues', async () => {
    const { paul, label } = await seedTasksScenario();

    const found = await findLabelsByName(paul, ['bug', 'FONCTIONNALITÉ', 'Inconnue']);

    expect(found.map((l) => l.id)).toEqual([label.Bug, label.Fonctionnalité]);
    expect(await findLabelsByName(paul, [])).toEqual([]);
  });

  it('ne rend que les étiquettes de l’organisation, même quand le nom est le même ailleurs', async () => {
    const { paul, zoe, label } = await seedTasksScenario();

    const [zoeBug] = await findLabelsByName(zoe, ['Bug']);
    const [paulBug] = await findLabelsByName(paul, ['Bug']);

    expect(zoeBug?.id).not.toBe(label.Bug);
    expect(paulBug?.id).toBe(label.Bug);
  });

  it(`refuse plus de ${MAX_IDS} noms`, async () => {
    const { paul } = await seedTasksScenario();
    const names = Array.from({ length: MAX_IDS + 1 }, (_, i) => `étiquette ${i}`);

    await expect(findLabelsByName(paul, names)).rejects.toMatchObject({ code: 'invalid' });
  });
});
