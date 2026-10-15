import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { TaskError } from '@/server/tasks/errors';
import { deleteLabel, updateLabel } from '@/server/tasks/labels';
import { createProject, updateProject } from '@/server/tasks/projects';
import { createStatus, deleteStatus, moveStatus, updateStatus } from '@/server/tasks/statuses';
import {
  createProjectAction,
  createStatusAction,
  deleteLabelAction,
  deleteStatusAction,
  moveStatusAction,
  updateLabelAction,
  updateProjectAction,
  updateStatusAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/tasks/projects', () => ({ createProject: vi.fn(), updateProject: vi.fn() }));
vi.mock('@/server/tasks/statuses', () => ({
  createStatus: vi.fn(),
  deleteStatus: vi.fn(),
  moveStatus: vi.fn(),
  updateStatus: vi.fn(),
}));
vi.mock('@/server/tasks/labels', () => ({ deleteLabel: vi.fn(), updateLabel: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const OTHER_ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const SECRET = 'Nom de client confidentiel';
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
const postgresError = () =>
  Object.assign(new Error(`valeur trop longue : « ${SECRET} »`), {
    code: '22001',
    severity: 'ERROR',
  });

describe('createProjectAction', () => {
  it('crée le projet avec la clé saisie, en majuscules', async () => {
    vi.mocked(createProject).mockResolvedValue({ id: ID, key: 'OPS', name: 'Opérations' });

    await expect(createProjectAction({ name: ' Opérations ', key: ' ops ' })).resolves.toEqual({
      ok: true,
    });

    expect(createProject).toHaveBeenCalledWith(ctx, { name: 'Opérations', key: 'OPS' });
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('tire la clé du nom quand elle est absente', async () => {
    await createProjectAction({ name: "Rénov'Ouest" });

    expect(createProject).toHaveBeenCalledWith(ctx, { name: "Rénov'Ouest", key: 'REN' });
  });

  it.each([
    ['un nom vide', { name: ' ' }],
    ['un nom de 81 caractères', { name: 'a'.repeat(81) }],
    ['une clé d’une lettre', { name: 'Projet', key: 'A' }],
    ['une clé de 11 caractères', { name: 'Projet', key: 'ABCDEFGHIJK' }],
    ['une clé qui commence par un chiffre', { name: 'Projet', key: '1AB' }],
    ['une clé accentuée', { name: 'Projet', key: 'ÉTÉ' }],
    ['une clé avec un tiret', { name: 'Projet', key: 'A-B' }],
    ['un champ interdit (acl)', { name: 'Projet', acl: [ID] }],
  ])('refuse %s sans rien écrire', async (_name, input) => {
    await expect(createProjectAction(input as never)).resolves.toEqual(INVALID);

    expect(createProject).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rend le message d’un doublon de clé, sans journal', async () => {
    vi.mocked(createProject).mockRejectedValue(
      new TaskError('conflict', 'Un projet porte déjà cette clé.'),
    );

    await expect(createProjectAction({ name: 'Projet', key: 'LEO' })).resolves.toEqual({
      ok: false,
      error: 'Un projet porte déjà cette clé.',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans le texte saisi', async () => {
    vi.mocked(createProject).mockRejectedValue(postgresError());

    await expect(createProjectAction({ name: SECRET })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.create_project');
  });
});

describe('updateProjectAction', () => {
  it('renomme le projet et change sa clé', async () => {
    vi.mocked(updateProject).mockResolvedValue(undefined);

    await expect(updateProjectAction(ID, { name: 'Leon', key: 'new' })).resolves.toEqual({
      ok: true,
    });

    expect(updateProject).toHaveBeenCalledWith(ctx, ID, { name: 'Leon', key: 'NEW' });
  });

  it.each([
    ['un identifiant qui n’est pas un UUID', 'pas-un-uuid', { name: 'Leon' }],
    ['une clé invalide', ID, { key: 'x' }],
    ['un nom vide', ID, { name: '' }],
    ['le compteur de numéros (lastNumber)', ID, { lastNumber: 0 }],
  ])('refuse %s sans rien écrire', async (_name, id, patch) => {
    await expect(updateProjectAction(id, patch as never)).resolves.toEqual(INVALID);

    expect(updateProject).not.toHaveBeenCalled();
  });
});

describe('statuts', () => {
  const NEW_STATUS = { projectId: ID, label: 'En test', color: '#0891b2', category: 'started' };

  it('crée un statut', async () => {
    await expect(
      createStatusAction({ ...NEW_STATUS, label: ' En test ' } as never),
    ).resolves.toEqual({ ok: true });

    expect(createStatus).toHaveBeenCalledWith(ctx, NEW_STATUS);
  });

  it.each([
    ['un libellé vide', { label: '' }],
    ['un libellé de 41 caractères', { label: 'a'.repeat(41) }],
    ['une couleur hors du motif', { color: 'red' }],
    ['une couleur en majuscules', { color: '#0891B2' }],
    ['une catégorie inconnue', { category: 'triage' }],
    ['un projet qui n’est pas un UUID', { projectId: 'pas-un-uuid' }],
    ['une position imposée', { position: 0 }],
  ])('refuse %s à la création', async (_name, change) => {
    await expect(createStatusAction({ ...NEW_STATUS, ...change } as never)).resolves.toEqual(
      INVALID,
    );

    expect(createStatus).not.toHaveBeenCalled();
  });

  it('modifie le libellé, la couleur et la catégorie', async () => {
    const patch = { label: 'En revue', color: '#059669', category: 'started' } as const;

    await expect(updateStatusAction(ID, patch)).resolves.toEqual({ ok: true });

    expect(updateStatus).toHaveBeenCalledWith(ctx, ID, patch);
  });

  it.each([
    ['une catégorie inconnue', { category: 'triage' }],
    ['un champ interdit (projectId)', { projectId: OTHER_ID }],
    ['une position imposée', { position: 3 }],
  ])('refuse %s à la modification', async (_name, patch) => {
    await expect(updateStatusAction(ID, patch as never)).resolves.toEqual(INVALID);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('range le statut d’un cran', async () => {
    await expect(moveStatusAction(ID, 'up')).resolves.toEqual({ ok: true });
    await expect(moveStatusAction(ID, 'left' as never)).resolves.toEqual(INVALID);

    expect(moveStatus).toHaveBeenCalledOnce();
    expect(moveStatus).toHaveBeenCalledWith(ctx, ID, 'up');
  });

  it('supprime un statut en déplaçant ses tâches vers le statut de repli', async () => {
    await expect(deleteStatusAction(ID, OTHER_ID)).resolves.toEqual({ ok: true });
    await expect(deleteStatusAction(ID, 'pas-un-uuid')).resolves.toEqual(INVALID);

    expect(deleteStatus).toHaveBeenCalledOnce();
    expect(deleteStatus).toHaveBeenCalledWith(ctx, ID, OTHER_ID);
  });

  it('rend le message de la protection de la dernière catégorie, sans journal', async () => {
    vi.mocked(deleteStatus).mockRejectedValue(
      new TaskError('conflict', 'Chaque catégorie garde au moins un statut.'),
    );
    vi.mocked(updateStatus).mockRejectedValue(
      new TaskError('conflict', 'Chaque catégorie garde au moins un statut.'),
    );

    for (const result of [
      await deleteStatusAction(ID, OTHER_ID),
      await updateStatusAction(ID, { category: 'todo' }),
    ]) {
      expect(result).toEqual({ ok: false, error: 'Chaque catégorie garde au moins un statut.' });
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans le texte saisi', async () => {
    vi.mocked(updateStatus).mockRejectedValue(postgresError());

    await expect(updateStatusAction(ID, { label: SECRET })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.update_status');
  });
});

describe('étiquettes', () => {
  it('renomme l’étiquette, change sa couleur, puis la supprime', async () => {
    await expect(updateLabelAction(ID, { name: ' Urgent ', color: '#dc2626' })).resolves.toEqual({
      ok: true,
    });
    await expect(deleteLabelAction(ID)).resolves.toEqual({ ok: true });

    expect(updateLabel).toHaveBeenCalledWith(ctx, ID, { name: 'Urgent', color: '#dc2626' });
    expect(deleteLabel).toHaveBeenCalledWith(ctx, ID);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    ['un nom vide', { name: ' ' }],
    ['un nom de 41 caractères', { name: 'a'.repeat(41) }],
    ['une couleur hors du motif', { color: '#fff' }],
    ['un champ interdit (acl)', { acl: [ID] }],
  ])('refuse %s sans rien écrire', async (_name, patch) => {
    await expect(updateLabelAction(ID, patch as never)).resolves.toEqual(INVALID);
    await expect(deleteLabelAction('pas-un-uuid')).resolves.toEqual(INVALID);

    expect(updateLabel).not.toHaveBeenCalled();
    expect(deleteLabel).not.toHaveBeenCalled();
  });

  it('rend le message d’un nom déjà pris, et journalise le reste sans son texte', async () => {
    vi.mocked(updateLabel).mockRejectedValue(
      new TaskError('conflict', 'Une étiquette porte déjà ce nom.'),
    );
    vi.mocked(deleteLabel).mockRejectedValue(postgresError());

    await expect(updateLabelAction(ID, { name: 'Bug' })).resolves.toEqual({
      ok: false,
      error: 'Une étiquette porte déjà ce nom.',
    });
    await expect(deleteLabelAction(ID)).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('ne change rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(deleteLabelAction(ID)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(deleteLabel).not.toHaveBeenCalled();
  });
});
