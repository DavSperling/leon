import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { addComment } from '@/server/tasks/activity';
import { TaskError } from '@/server/tasks/errors';
import { deleteTasks, getTaskRef, updateTask } from '@/server/tasks/tasks';
import { addCommentAction, changeProjectAction, deleteTaskAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/tasks/activity', () => ({ addComment: vi.fn() }));
vi.mock('@/server/tasks/tasks', () => ({
  deleteTasks: vi.fn(),
  getTaskRef: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const PROJECT_ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const SECRET = 'Commentaire confidentiel du client';
const ACTOR = { kind: 'user', userId: 'user' };
const INVALID = { ok: false, error: 'Saisie invalide.' };

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
});

afterEach(() => {
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain(SECRET);
});

// Ce que Postgres renvoie : le message cite la valeur refusée, donc le texte saisi.
function postgresError(): Error {
  return Object.assign(new Error(`valeur trop longue : « ${SECRET} »`), {
    code: '22001',
    severity: 'ERROR',
  });
}

describe('addCommentAction', () => {
  it('ajoute le commentaire en nom du lecteur, texte épuré, puis rafraîchit', async () => {
    vi.mocked(addComment).mockResolvedValue(undefined);

    await expect(addCommentAction(ID, `  ${SECRET}\n`)).resolves.toEqual({ ok: true });

    expect(addComment).toHaveBeenCalledWith(ctx, ID, SECRET, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('accepte 20 000 caractères et refuse le 20 001e', async () => {
    vi.mocked(addComment).mockResolvedValue(undefined);

    await expect(addCommentAction(ID, 'a'.repeat(20_000))).resolves.toEqual({ ok: true });
    vi.mocked(addComment).mockClear();
    await expect(addCommentAction(ID, 'a'.repeat(20_001))).resolves.toEqual(INVALID);

    expect(addComment).not.toHaveBeenCalled();
  });

  it.each([
    ['un commentaire vide', ID, ''],
    ['un commentaire d’espaces', ID, ' \n\t '],
    ['un identifiant qui n’est pas un UUID', 'LEO-12', 'Bonjour'],
  ])('refuse %s sans rien écrire', async (_name, taskId, body) => {
    await expect(addCommentAction(taskId, body)).resolves.toEqual(INVALID);

    expect(addComment).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rend le message d’une TaskError (tâche disparue) sans rafraîchir', async () => {
    vi.mocked(addComment).mockRejectedValue(new TaskError('not_found', 'Tâche introuvable.'));

    await expect(addCommentAction(ID, SECRET)).resolves.toEqual({
      ok: false,
      error: 'Tâche introuvable.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans le texte saisi et ne montre rien au lecteur', async () => {
    vi.mocked(addComment).mockRejectedValue(postgresError());

    await expect(addCommentAction(ID, SECRET)).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.add_comment');
    expect(consoleError.mock.calls[0]?.[2]).toContain('code=22001');
  });

  it('n’écrit rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(addCommentAction(ID, 'Bonjour')).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(addComment).not.toHaveBeenCalled();
  });
});

describe('deleteTaskAction', () => {
  it('supprime la tâche, rafraîchit, puis mène à la liste d’où l’on vient', async () => {
    vi.mocked(deleteTasks).mockResolvedValue(1);

    await expect(deleteTaskAction(ID, 'groupe=priorite&assigne=moi')).rejects.toThrow(
      'NEXT_REDIRECT /taches?groupe=priorite&assigne=moi',
    );

    expect(deleteTasks).toHaveBeenCalledWith(ctx, [ID]);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    ['une adresse', '//exemple.com'],
    ['un chemin', '/autre'],
    ['un schéma', 'javascript:alert(1)'],
    ['un réglage inconnu', 'redirect=//exemple.com'],
    ['rien', ''],
  ])('ne mène jamais ailleurs qu’à /taches : %s dans `retour`', async (_name, retour) => {
    vi.mocked(deleteTasks).mockResolvedValue(1);

    await expect(deleteTaskAction(ID, retour)).rejects.toThrow('NEXT_REDIRECT /taches');

    expect(vi.mocked(redirect).mock.calls).toEqual([['/taches']]);
  });

  it.each([
    ['un identifiant qui n’est pas un UUID', 'LEO-12', ''],
    ['un `retour` démesuré', ID, 'a'.repeat(2_001)],
  ])('refuse %s sans rien supprimer ni rediriger', async (_name, id, retour) => {
    await expect(deleteTaskAction(id, retour)).resolves.toEqual(INVALID);

    expect(deleteTasks).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rend l’erreur sans rediriger, et sans ses détails quand elle est interne', async () => {
    vi.mocked(deleteTasks).mockRejectedValue(postgresError());

    await expect(deleteTaskAction(ID, '')).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.delete_task');
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('changeProjectAction', () => {
  it('change le projet, puis mène à la page sous sa nouvelle référence, liste d’origine gardée', async () => {
    vi.mocked(updateTask).mockResolvedValue(undefined);
    vi.mocked(getTaskRef).mockResolvedValue('OPS-2');

    await expect(changeProjectAction(ID, PROJECT_ID, 'groupe=priorite&bruit=1')).rejects.toThrow(
      `NEXT_REDIRECT /taches/OPS-2?retour=${encodeURIComponent('groupe=priorite')}`,
    );

    expect(updateTask).toHaveBeenCalledWith(ctx, ID, { projectId: PROJECT_ID }, ACTOR);
    expect(getTaskRef).toHaveBeenCalledWith(ctx, ID);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('mène à /taches/OPS-2 sans paramètre quand il n’y a pas de liste à garder', async () => {
    vi.mocked(getTaskRef).mockResolvedValue('OPS-2');

    await expect(changeProjectAction(ID, PROJECT_ID, '//exemple.com')).rejects.toThrow(
      'NEXT_REDIRECT /taches/OPS-2',
    );
    expect(vi.mocked(redirect).mock.calls).toEqual([['/taches/OPS-2']]);
  });

  it('retombe sur la liste si la tâche n’est plus lisible', async () => {
    vi.mocked(getTaskRef).mockResolvedValue(null);

    await expect(changeProjectAction(ID, PROJECT_ID, '')).rejects.toThrow('NEXT_REDIRECT /taches');
  });

  it.each([
    ['une tâche qui n’est pas un UUID', 'LEO-12', PROJECT_ID],
    ['un projet qui n’est pas un UUID', ID, 'OPS'],
  ])('refuse %s sans rien écrire', async (_name, id, projectId) => {
    await expect(changeProjectAction(id, projectId, '')).resolves.toEqual(INVALID);

    expect(updateTask).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rend le message d’une TaskError (projet inconnu) sans rediriger', async () => {
    vi.mocked(updateTask).mockRejectedValue(new TaskError('not_found', 'Projet introuvable.'));

    await expect(changeProjectAction(ID, PROJECT_ID, '')).resolves.toEqual({
      ok: false,
      error: 'Projet introuvable.',
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(getTaskRef).not.toHaveBeenCalled();
  });
});
