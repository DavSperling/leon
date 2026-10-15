import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { requireUserContext } from '@/server/auth/session';
import { TaskError } from '@/server/tasks/errors';
import { createView, deleteView, setTeamDefault, updateView } from '@/server/tasks/views';
import {
  createViewAction,
  deleteViewAction,
  setTeamDefaultAction,
  updateViewAction,
} from './view-actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/tasks/views', () => ({
  createView: vi.fn(),
  deleteView: vi.fn(),
  setTeamDefault: vi.fn(),
  updateView: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const SECRET = 'Vue confidentielle du client';
const INVALID = { ok: false, error: 'Saisie invalide.' };
const CONFIG = { ...DEFAULT_VIEW_CONFIG, layout: 'board', groupBy: 'priority' } as const;

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

describe('createViewAction', () => {
  it('crée la vue sous les droits du lecteur, puis rafraîchit les tâches', async () => {
    vi.mocked(createView).mockResolvedValue({ id: ID } as never);

    await expect(
      createViewAction({ name: `  ${SECRET}  `, config: CONFIG, team: false }),
    ).resolves.toEqual({ ok: true, id: ID });

    expect(createView).toHaveBeenCalledWith(ctx, { name: SECRET, config: CONFIG, team: false });
    expect(setTeamDefault).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('pose le défaut de l’équipe sur la vue d’équipe qu’elle vient de créer', async () => {
    vi.mocked(createView).mockResolvedValue({ id: ID } as never);

    await createViewAction({ name: 'Défaut', config: CONFIG, team: true, makeDefault: true });

    expect(createView).toHaveBeenCalledWith(ctx, { name: 'Défaut', config: CONFIG, team: true });
    expect(setTeamDefault).toHaveBeenCalledWith(ctx, ID);
  });

  it.each([
    ['un nom vide', { name: '  ', config: CONFIG, team: false }],
    ['un nom de 61 caractères', { name: 'a'.repeat(61), config: CONFIG, team: false }],
    [
      'un défaut d’équipe sur une vue personnelle',
      { name: 'Vue', config: CONFIG, team: false, makeDefault: true },
    ],
    [
      'des réglages inconnus',
      { name: 'Vue', config: { ...CONFIG, layout: 'agenda' }, team: false },
    ],
    ['un réglage en trop', { name: 'Vue', config: { ...CONFIG, acl: [ID] }, team: false }],
    ['un champ interdit (ownerId)', { name: 'Vue', config: CONFIG, team: false, ownerId: ID }],
    ['aucune portée', { name: 'Vue', config: CONFIG }],
  ])('refuse %s sans rien écrire', async (_name, input) => {
    await expect(createViewAction(input as never)).resolves.toEqual(INVALID);

    expect(createView).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('ne cite pas le nom saisi quand l’entrée est refusée', async () => {
    const result = await createViewAction({
      name: SECRET,
      config: CONFIG,
      team: false,
      makeDefault: true,
    });

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('journalise une erreur interne sans son texte et ne montre rien au lecteur', async () => {
    vi.mocked(createView).mockRejectedValue(postgresError());

    await expect(createViewAction({ name: SECRET, config: CONFIG, team: false })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.create_view');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('ne crée rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(createViewAction({ name: 'Vue', config: CONFIG, team: false })).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );

    expect(createView).not.toHaveBeenCalled();
  });
});

describe('updateViewAction', () => {
  it('renomme ou enregistre les réglages, sous les droits du lecteur', async () => {
    vi.mocked(updateView).mockResolvedValue(undefined);

    await expect(updateViewAction(ID, { name: ' Sprint ' })).resolves.toEqual({ ok: true });
    await expect(updateViewAction(ID, { config: CONFIG })).resolves.toEqual({ ok: true });

    expect(updateView).toHaveBeenNthCalledWith(1, ctx, ID, { name: 'Sprint' });
    expect(updateView).toHaveBeenNthCalledWith(2, ctx, ID, { config: CONFIG });
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    ['un identifiant qui n’est pas un UUID', 'pas-un-uuid', { name: 'Vue' }],
    ['un nom vide', ID, { name: '' }],
    ['des réglages inconnus', ID, { config: { layout: 'agenda' } }],
    ['un champ interdit (acl)', ID, { acl: [ID] }],
    ['un champ interdit (ownerId)', ID, { ownerId: ID }],
  ])('refuse %s sans rien écrire', async (_name, id, patch) => {
    await expect(updateViewAction(id, patch as never)).resolves.toEqual(INVALID);

    expect(updateView).not.toHaveBeenCalled();
  });

  it('rend le message d’une TaskError (vue d’un autre auteur) sans journal', async () => {
    vi.mocked(updateView).mockRejectedValue(new TaskError('not_found', 'Vue introuvable.'));

    await expect(updateViewAction(ID, { name: 'Vue' })).resolves.toEqual({
      ok: false,
      error: 'Vue introuvable.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans le texte saisi', async () => {
    vi.mocked(updateView).mockRejectedValue(postgresError());

    await expect(updateViewAction(ID, { name: SECRET })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.update_view');
  });
});

describe('deleteViewAction et setTeamDefaultAction', () => {
  it('supprime la vue sous les droits du lecteur, puis rafraîchit', async () => {
    vi.mocked(deleteView).mockResolvedValue(undefined);

    await expect(deleteViewAction(ID)).resolves.toEqual({ ok: true });

    expect(deleteView).toHaveBeenCalledWith(ctx, ID);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('choisit le défaut de l’équipe', async () => {
    vi.mocked(setTeamDefault).mockResolvedValue(undefined);

    await expect(setTeamDefaultAction(ID)).resolves.toEqual({ ok: true });

    expect(setTeamDefault).toHaveBeenCalledWith(ctx, ID);
  });

  it('refuse un identifiant qui n’est pas un UUID, sans rien écrire', async () => {
    await expect(deleteViewAction('pas-un-uuid')).resolves.toEqual(INVALID);
    await expect(setTeamDefaultAction('pas-un-uuid')).resolves.toEqual(INVALID);
    await expect(setTeamDefaultAction(null as never)).resolves.toEqual(INVALID);

    expect(deleteView).not.toHaveBeenCalled();
    expect(setTeamDefault).not.toHaveBeenCalled();
  });

  it('rend le message d’une TaskError et journalise le reste sans son texte', async () => {
    vi.mocked(setTeamDefault).mockRejectedValue(
      new TaskError('not_found', 'Vue d’équipe introuvable.'),
    );
    vi.mocked(deleteView).mockRejectedValue(postgresError());

    await expect(setTeamDefaultAction(ID)).resolves.toEqual({
      ok: false,
      error: 'Vue d’équipe introuvable.',
    });
    await expect(deleteViewAction(ID)).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.delete_view');
  });
});
