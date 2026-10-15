import { describe, expect, it } from 'vitest';
import { createTestTenant } from '@/test/fixtures';
import { seedTasksScenario } from '@/test/tasks-scenario';
import { TaskError } from './errors';
import { listLabels } from './labels';
import { createProject, ensureDefaultProject, listProjects, updateProject } from './projects';
import { listStatuses } from './statuses';

describe('ensureDefaultProject', () => {
  it('appelé dix fois en parallèle, crée un seul projet avec ses sept statuts et trois étiquettes', async () => {
    const { members } = await createTestTenant(['Paul Martin', 'Marie Durand']);
    const [paul, marie] = members;
    if (!paul || !marie) throw new Error('membres non créés');

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ensureDefaultProject(i % 2 === 0 ? paul : marie, "Rénov'Ouest"),
      ),
    );

    const projects = await listProjects(paul);
    expect(projects).toEqual([{ id: expect.any(String), key: 'REN', name: "Rénov'Ouest" }]);
    const statuses = await listStatuses(paul);
    expect(statuses.map((status) => [status.label, status.category])).toEqual([
      ['Backlog', 'backlog'],
      ['À faire', 'todo'],
      ['En cours', 'started'],
      ['En revue', 'started'],
      ['Terminé', 'done'],
      ['Annulé', 'canceled'],
      ['Doublon', 'canceled'],
    ]);
    expect((await listLabels(marie)).map((label) => label.name)).toEqual([
      'Amélioration',
      'Bug',
      'Fonctionnalité',
    ]);
  });

  it('ne fait rien quand un projet existe déjà', async () => {
    const { paul } = await seedTasksScenario();

    await ensureDefaultProject(paul, 'Autre nom');

    const projects = await listProjects(paul);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Atelier Nord');
  });

  it('tronque le nom à 80 caractères et tire la clé de ses lettres', async () => {
    const { members } = await createTestTenant(['Paul Martin']);
    const [paul] = members;
    if (!paul) throw new Error('membre non créé');

    await ensureDefaultProject(paul, `1234${'x'.repeat(96)}`);

    const [project] = await listProjects(paul);
    expect(project?.name).toHaveLength(80);
    expect(project?.key).toBe('XXX');
  });

  it('prend la clé TCH quand le nom n’a pas deux lettres', async () => {
    const { members } = await createTestTenant(['Marie Durand']);
    const [marie] = members;
    if (!marie) throw new Error('membre non créé');

    await ensureDefaultProject(marie, '12 34');

    expect((await listProjects(marie))[0]?.key).toBe('TCH');
  });

  it('donne à chaque organisation son projet : Zoé ne voit pas celui de Paul', async () => {
    const { paul, zoe, projectId, zoeProjectId } = await seedTasksScenario();

    expect((await listProjects(paul)).map((project) => project.id)).toEqual([projectId]);
    expect((await listProjects(zoe)).map((project) => project.id)).toEqual([zoeProjectId]);
    expect(await listStatuses(zoe, projectId)).toEqual([]);
  });
});

describe("une organisation qui n'a jamais ouvert les tâches", () => {
  it('n’a ni projet, ni statut, ni étiquette', async () => {
    const { members } = await createTestTenant(['Paul Martin']);
    const [paul] = members;
    if (!paul) throw new Error('membre non créé');

    expect(await listProjects(paul)).toEqual([]);
    expect(await listStatuses(paul)).toEqual([]);
    expect(await listLabels(paul)).toEqual([]);
  });
});

describe('createProject', () => {
  it('crée le projet avec les sept statuts par défaut', async () => {
    const { paul, marie } = await seedTasksScenario();

    const project = await createProject(paul, { name: 'Opérations', key: 'OPS' });

    expect(project).toEqual({ id: expect.any(String), key: 'OPS', name: 'Opérations' });
    expect(await listStatuses(paul, project.id)).toHaveLength(7);
    expect((await listProjects(marie)).map((p) => p.key)).toContain('OPS');
  });

  it('refuse une clé déjà prise dans l’organisation, pas dans une autre', async () => {
    const { paul, zoe } = await seedTasksScenario();
    await createProject(paul, { name: 'Opérations', key: 'OPS' });

    const duplicate = createProject(paul, { name: 'Autre', key: 'OPS' });
    await expect(duplicate).rejects.toMatchObject({ code: 'conflict' });
    await expect(duplicate).rejects.toBeInstanceOf(TaskError);
    await expect(createProject(zoe, { name: 'Opérations', key: 'OPS' })).resolves.toBeDefined();
  });
});

describe('updateProject', () => {
  it('renomme le projet et change sa clé', async () => {
    const { paul, projectId } = await seedTasksScenario();

    await updateProject(paul, projectId, { name: 'Atelier Sud', key: 'SUD' });

    const [project] = await listProjects(paul);
    expect(project).toEqual({ id: projectId, key: 'SUD', name: 'Atelier Sud' });
  });

  it('refuse une clé déjà prise par un autre projet', async () => {
    const { paul, projectId } = await seedTasksScenario();
    await createProject(paul, { name: 'Opérations', key: 'OPS' });

    await expect(updateProject(paul, projectId, { key: 'OPS' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('ne fait rien sans champ, et ne touche pas le projet d’une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();

    await expect(updateProject(paul, projectId, {})).resolves.toBeUndefined();
    await expect(updateProject(zoe, projectId, { name: 'Volé' })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await listProjects(paul))[0]?.name).toBe('Atelier Nord');
  });
});
