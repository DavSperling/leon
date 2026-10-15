import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { taskComments } from '@/server/db/schema/tasks';
import { DATA_GUARD_LINE } from '@/server/memory/render-card';
import { createProject } from '@/server/tasks/projects';
import { createTask, getTaskByRef } from '@/server/tasks/tasks';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { call, closeClients, connect } from '@/test/mcp-client';
import { readEvents, readTask, seedTasksScenario } from '@/test/tasks-scenario';

afterEach(async () => {
  vi.restoreAllMocks();
  await closeClients();
});

const STATUSES = 'Backlog, À faire, En cours, En revue, Terminé, Annulé, Doublon';
const LABELS = 'Amélioration, Bug, Fonctionnalité';

// L'agent des tests est claude-code (voir src/test/mcp-client.ts).
const AGENT = { actorKind: 'agent', client: 'claude-code' } as const;

async function detailOf(ctx: TenantContext, ref: string) {
  const detail = await getTaskByRef(ctx, ref);
  if (!detail) throw new Error(`${ref} introuvable`);
  return detail;
}

async function refOf(result: Awaited<ReturnType<typeof call>>): Promise<string> {
  expect(result.isError).toBeFalsy();
  return (result.structuredContent as { ref: string }).ref;
}

describe('outils de tâches : le parcours complet', () => {
  it('crée, liste, lit, modifie, commente et démarre une tâche dans une organisation sans projet', async () => {
    const { members } = await createTestTenant(['Paul Martin']);
    const paul = members[0];
    if (!paul) throw new Error('membre non créé');
    const client = await connect(paul);

    const empty = await call(client, 'task_list');
    expect(empty.text).toBe('Aucune tâche ne correspond.');

    const created = await call(client, 'task_create', {
      titre: 'Préparer le devis',
      description: 'Reprendre le chiffrage de mars.',
      priorite: 'haute',
      echeance: '2026-10-20',
      assigne: 'moi',
    });
    const ref = await refOf(created);
    expect(ref).toBe('ORG-1');
    expect(created.text).toContain('http://localhost:3000/taches/ORG-1');

    const listed = await call(client, 'task_list');
    expect(listed.text).toContain(DATA_GUARD_LINE);
    expect(listed.text).toContain(
      'ORG-1 · Backlog · Haute · Paul Martin · 2026-10-20 · Préparer le devis',
    );
    expect(listed.structuredContent).toMatchObject({
      total: 1,
      tasks: [{ ref: 'ORG-1', status: 'Backlog', priority: 'high', assignee: 'Paul Martin' }],
    });

    const read = await call(client, 'task_get', { ref: 'org-1' });
    expect(read.text).toContain('# ORG-1 Préparer le devis');
    expect(read.text).toContain(DATA_GUARD_LINE);
    expect(read.text).toContain('Reprendre le chiffrage de mars.');
    expect(read.text).toContain(`## Statuts disponibles\n${STATUSES}`);
    expect(read.text).toContain(`## Étiquettes disponibles\n${LABELS}`);
    expect(read.text).toContain('http://localhost:3000/taches/ORG-1');

    const updated = await call(client, 'task_update', {
      ref,
      titre: 'Préparer le devis client',
      statut: 'À faire',
    });
    expect(updated.text).toContain('Tâche ORG-1 modifiée.');

    await call(client, 'task_comment', { ref, texte: 'Le client a répondu.' });
    const reread = await call(client, 'task_get', { ref });
    expect(reread.text).toContain('# ORG-1 Préparer le devis client');
    expect(reread.text).toContain('- Statut : À faire');
    expect(reread.text).toContain('· Claude Code (agent) : Le client a répondu.');

    const started = await call(client, 'task_start', { ref });
    expect(started.structuredContent).toMatchObject({
      ref: 'ORG-1',
      branch: 'paul/org-1-preparer-le-devis-client',
      status: 'En cours',
    });
    expect(started.text).toContain('Branche : paul/org-1-preparer-le-devis-client');
  });
});

describe('task_start', () => {
  it('assigne, passe en cours et écrit les événements de l’agent avec son client', async () => {
    const { paul, marie, projectId, status } = await seedTasksScenario();
    const { id } = await createTask(
      paul,
      { title: 'Corriger le bug', projectId, statusId: status['À faire'] },
      { kind: 'user', userId: paul.userId },
    );

    const result = await call(await connect(marie), 'task_start', { ref: 'ATE-1' });

    expect(result.structuredContent).toMatchObject({
      branch: 'marie/ate-1-corriger-le-bug',
      status: 'En cours',
    });
    expect(await readTask(id)).toMatchObject({
      assigneeId: marie.userId,
      statusId: status['En cours'],
    });
    const events = await readEvents(id);
    expect(events.map((event) => event.kind)).toEqual(['created', 'assignee', 'status']);
    expect(events.slice(1)).toEqual([
      expect.objectContaining({ ...AGENT, actorId: marie.userId }),
      expect.objectContaining({
        ...AGENT,
        actorId: marie.userId,
        payload: { from: 'À faire', to: 'En cours' },
      }),
    ]);
  });

  it('laisse une tâche déjà en cours dans son statut', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const { id } = await createTask(
      paul,
      { title: 'Relire la PR', projectId, statusId: status['En revue'] },
      { kind: 'user', userId: paul.userId },
    );

    await call(await connect(paul), 'task_start', { ref: 'ATE-1' });

    expect(await readTask(id)).toMatchObject({
      assigneeId: paul.userId,
      statusId: status['En revue'],
    });
    expect((await readEvents(id)).map((event) => event.kind)).toEqual(['created', 'assignee']);
  });
});

describe('références inconnues', () => {
  it('rendent un texte fixe qui dit quoi corriger, sans rien écrire', async () => {
    const { paul, zoe } = await seedTasksScenario();
    const client = await connect(paul);
    const zoeEmail = await adminDb
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, zoe.userId));

    const unknownRef = await call(client, 'task_get', { ref: 'ATE-99' });
    const unknownStatus = await call(client, 'task_create', {
      titre: 'Une tâche',
      statut: 'En test',
    });
    const unknownLabel = await call(client, 'task_create', {
      titre: 'Une tâche',
      etiquettes: ['Nope'],
    });
    const unknownProject = await call(client, 'task_create', { titre: 'Une tâche', projet: 'XYZ' });
    const unknownMember = await call(client, 'task_create', {
      titre: 'Une tâche',
      assigne: 'personne@test.leon',
    });
    const otherOrganization = await call(client, 'task_create', {
      titre: 'Une tâche',
      assigne: zoeEmail[0]?.email,
    });

    expect(unknownRef).toMatchObject({ isError: true, text: 'Tâche introuvable : ATE-99.' });
    expect(unknownStatus).toMatchObject({
      isError: true,
      text: `Statut inconnu. Statuts : ${STATUSES}.`,
    });
    expect(unknownLabel).toMatchObject({
      isError: true,
      text: `Étiquette inconnue. Étiquettes : ${LABELS}.`,
    });
    expect(unknownProject).toMatchObject({ isError: true, text: 'Projet inconnu. Projets : ATE.' });
    expect(unknownMember).toMatchObject({ isError: true, text: 'Membre introuvable.' });
    expect(otherOrganization).toEqual(unknownMember);
    expect((await call(client, 'task_list')).text).toBe('Aucune tâche ne correspond.');
  });

  it('refusent aussi une modification sans champ, un projet à préciser et un cycle de parents', async () => {
    const { paul } = await seedTasksScenario();
    await createProject(paul, { name: 'Second', key: 'SEC' });
    const client = await connect(paul);
    const parent = await refOf(
      await call(client, 'task_create', { titre: 'Parent', projet: 'ATE' }),
    );
    const child = await refOf(await call(client, 'task_create', { titre: 'Enfant', parent }));

    const noField = await call(client, 'task_update', { ref: parent });
    const noProject = await call(client, 'task_create', { titre: 'Sans projet' });
    const cycle = await call(client, 'task_update', { ref: parent, parent: child });

    expect(noField.text).toBe('Rien à modifier : précisez au moins un champ.');
    expect(noProject.text).toBe('Précisez le projet. Projets : ATE, SEC.');
    expect(cycle).toMatchObject({ isError: true, text: 'Ce parent créerait un cycle.' });
  });
});

describe('task_update', () => {
  it('etiquettes_ajout ne retire rien, etiquettes_retrait ne retire que ce qui est nommé', async () => {
    const { paul } = await seedTasksScenario();
    const client = await connect(paul);
    const ref = await refOf(
      await call(client, 'task_create', { titre: 'Étiqueter', etiquettes: ['bug'] }),
    );

    await call(client, 'task_update', { ref, etiquettes_ajout: ['Fonctionnalité'] });
    const both = await call(client, 'task_list', { etiquette: 'Bug' });
    await call(client, 'task_update', { ref, etiquettes_retrait: ['Bug'] });
    const one = await call(client, 'task_list');

    const labelsOf = (result: typeof both) =>
      (result.structuredContent as { tasks: { labels: string[] }[] }).tasks[0]?.labels;
    expect(labelsOf(both)).toEqual(['Bug', 'Fonctionnalité']);
    expect(labelsOf(one)).toEqual(['Fonctionnalité']);
  });

  it('null et « aucun » vident l’échéance, l’assigné, la priorité et le parent', async () => {
    const { paul } = await seedTasksScenario();
    const client = await connect(paul);
    const parent = await refOf(await call(client, 'task_create', { titre: 'Parent' }));
    const ref = await refOf(
      await call(client, 'task_create', {
        titre: 'À vider',
        echeance: '2026-10-20',
        assigne: 'moi',
        priorite: 'urgente',
        parent,
      }),
    );

    await call(client, 'task_update', { ref, echeance: null });
    await call(client, 'task_update', { ref, assigne: 'aucun' });
    await call(client, 'task_update', { ref, priorite: null, parent: 'aucun' });

    const detail = await detailOf(paul, ref);
    expect(detail).toMatchObject({
      dueDate: null,
      assignee: null,
      priority: 'none',
      parentRef: null,
    });
    const events = await readEvents(detail.id);
    expect(events.map((event) => event.kind)).toEqual([
      'created',
      'due_date',
      'assignee',
      'parent',
      'priority',
    ]);
    expect(events[1]).toMatchObject({ ...AGENT, payload: { from: '2026-10-20', to: null } });
  });

  it('change de projet, rend le nouvel identifiant et pose le statut de même catégorie', async () => {
    const { paul } = await seedTasksScenario();
    await createProject(paul, { name: 'Second', key: 'SEC' });
    const client = await connect(paul);
    const ref = await refOf(
      await call(client, 'task_create', { titre: 'À déplacer', projet: 'ATE' }),
    );

    const moved = await call(client, 'task_update', { ref, projet: 'sec' });

    expect(moved.structuredContent).toMatchObject({ ref: 'SEC-1' });
    expect(moved.text).toContain('Tâche ATE-1 déplacée : elle s’appelle désormais SEC-1.');
    expect((await call(client, 'task_get', { ref: 'SEC-1' })).text).toContain('- Statut : Backlog');
  });
});

describe('task_create', () => {
  it('range une sous-tâche dans le projet de son parent et la montre sous lui', async () => {
    const { paul } = await seedTasksScenario();
    await createProject(paul, { name: 'Second', key: 'SEC' });
    const client = await connect(paul);
    const parent = await refOf(
      await call(client, 'task_create', { titre: 'Parent', projet: 'SEC' }),
    );

    const child = await refOf(
      await call(client, 'task_create', { titre: 'Enfant', parent, statut: 'started' }),
    );

    expect(child).toBe('SEC-2');
    const read = await call(client, 'task_get', { ref: parent });
    expect(read.text).toContain('## Sous-tâches\n- SEC-2 · En cours · Enfant');
    expect((await call(client, 'task_get', { ref: child })).text).toContain(
      '- Parent : SEC-1 · Parent',
    );
  });
});

describe('task_list', () => {
  it('range les plus urgentes d’abord et filtre par assigné, texte et statut', async () => {
    const { paul, marie } = await seedTasksScenario();
    const client = await connect(paul);
    await call(client, 'task_create', { titre: 'Basse', priorite: 'basse' });
    await call(client, 'task_create', { titre: 'Sans priorité' });
    await call(client, 'task_create', { titre: 'Urgente', priorite: 'urgente', assigne: 'moi' });
    await call(client, 'task_create', { titre: 'Faite', statut: 'done' });

    const open = await call(client, 'task_list');
    const mine = await call(client, 'task_list', { assigne: 'moi' });
    const unassigned = await call(client, 'task_list', { assigne: 'aucun', q: 'prio' });
    const done = await call(client, 'task_list', { statut: ['done'] });
    const forMarie = await call(await connect(marie), 'task_list');

    const titles = (result: typeof open) =>
      (result.structuredContent as { tasks: { title: string }[] }).tasks.map((task) => task.title);
    expect(titles(open)).toEqual(['Urgente', 'Basse', 'Sans priorité']);
    expect(titles(mine)).toEqual(['Urgente']);
    expect(titles(unassigned)).toEqual(['Sans priorité']);
    expect(titles(done)).toEqual(['Faite']);
    expect(titles(forMarie)).toEqual(['Urgente', 'Basse', 'Sans priorité']);
  });

  it('affiche 20 tâches par défaut et mentionne les autres', async () => {
    const { paul, projectId } = await seedTasksScenario();
    for (let i = 1; i <= 25; i++) {
      await createTask(
        paul,
        { title: `Tâche ${i}`, projectId },
        { kind: 'user', userId: paul.userId },
      );
    }

    const result = await call(await connect(paul), 'task_list');

    expect(result.text).toContain('20 tâche(s) sur 25 :');
    expect(result.text).toContain('… 5 autre(s) non affichée(s)');
    expect(result.structuredContent).toMatchObject({ total: 25 });
  });

  it('tient 100 tâches aux titres longs sous 4 000 caractères, avec la mention de troncature', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    for (let i = 1; i <= 100; i++) {
      await createTask(paul, { title: `${i} ${'x'.repeat(150)}`, projectId }, actor);
    }

    const result = await call(await connect(paul), 'task_list', { limite: 100 });

    expect(result.text.length).toBeLessThanOrEqual(4_000);
    expect(result.text).toContain('sur 100 :');
    expect(result.text).toMatch(/… \d+ autre\(s\) non affichée\(s\)/);
    const { total, tasks } = result.structuredContent as { total: number; tasks: unknown[] };
    expect(total).toBe(100);
    expect(tasks.length).toBeGreaterThan(10);
    expect(tasks.length).toBeLessThan(100);
  });
});

describe('autre organisation', () => {
  it('ne voit rien de l’équipe et ne peut rien lui écrire', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const { id } = await createTask(
      paul,
      { title: 'Chantier Nord', projectId },
      { kind: 'user', userId: paul.userId },
    );
    const client = await connect(zoe);

    const list = await call(client, 'task_list');
    const attempts = await Promise.all([
      call(client, 'task_get', { ref: 'ATE-1' }),
      call(client, 'task_update', { ref: 'ATE-1', titre: 'Détourné' }),
      call(client, 'task_comment', { ref: 'ATE-1', texte: 'Intrus' }),
      call(client, 'task_start', { ref: 'ATE-1' }),
    ]);

    expect(list.text).toBe('Aucune tâche ne correspond.');
    for (const attempt of attempts) {
      expect(attempt).toMatchObject({ isError: true, text: 'Tâche introuvable : ATE-1.' });
    }
    expect(await readTask(id)).toMatchObject({ title: 'Chantier Nord', assigneeId: null });
    expect((await readEvents(id)).map((event) => event.kind)).toEqual(['created']);
    expect(await adminDb.select().from(taskComments).where(eq(taskComments.taskId, id))).toEqual(
      [],
    );
  });
});

describe('task_comment', () => {
  it('écrit le commentaire sous le nom de l’utilisateur du jeton et l’événement de l’agent', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const { id } = await createTask(
      paul,
      { title: 'À commenter', projectId },
      { kind: 'user', userId: paul.userId },
    );

    await call(await connect(paul), 'task_comment', { ref: 'ATE-1', texte: 'Fait côté API.' });

    const [comment] = await adminDb.select().from(taskComments).where(eq(taskComments.taskId, id));
    expect(comment).toMatchObject({ authorId: paul.userId, bodyMd: 'Fait côté API.' });
    expect(await readEvents(id)).toEqual([
      expect.objectContaining({ kind: 'created' }),
      expect.objectContaining({ kind: 'comment', ...AGENT, payload: { commentId: comment?.id } }),
    ]);
  });
});

describe('texte saisi', () => {
  it('ne se retrouve pas dans le journal quand la base refuse l’écriture', async () => {
    const { paul } = await seedTasksScenario();
    const client = await connect(paul);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Postgres refuse le caractère nul : l'erreur de la base cite la requête et ses paramètres.
    const result = await call(client, 'task_create', {
      titre: 'titre confidentiel',
      description: 'nul : \u0000',
    });

    expect(result).toMatchObject({ isError: true, text: 'Erreur interne de Leon.' });
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('confidentiel');
  });
});
