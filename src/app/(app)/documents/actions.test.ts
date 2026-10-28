import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import {
  addDocument,
  DocumentError,
  deleteDocument,
  deleteFolder,
} from '@/server/documents/documents';
import { addFileAction, deleteDocumentAction, deleteFolderAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/documents/documents', () => ({
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  deleteFolder: vi.fn(),
  DocumentError: class DocumentError extends Error {
    constructor(
      readonly code: string,
      readonly reason?: string,
    ) {
      super(code);
    }
  },
}));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const folderId = randomUUID();
const file = new File(['Devis du chantier Lebrun.'], 'plomberie.md');

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
  vi.mocked(addDocument).mockResolvedValue({ partial: false });
});

describe('addFileAction', () => {
  it('ajoute un fichier seul, sans dossier, et ne rafraîchit pas la liste', async () => {
    await expect(addFileAction(form({ file }))).resolves.toEqual({ error: null, partial: false });

    expect(addDocument).toHaveBeenCalledWith(ctx, file, undefined);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('ajoute un fichier de dossier avec son identifiant, son nom nettoyé et son chemin', async () => {
    const state = await addFileAction(
      form({ file, folderId, folderName: '  chantier-lebrun ', path: 'lots/plomberie.md' }),
    );

    expect(state).toEqual({ error: null, partial: false });
    expect(addDocument).toHaveBeenCalledWith(ctx, file, {
      id: folderId,
      name: 'chantier-lebrun',
      path: 'lots/plomberie.md',
    });
  });

  it('refuse sans fichier', async () => {
    await expect(
      addFileAction(form({ folderId, folderName: 'dossier', path: 'a.md' })),
    ).resolves.toEqual({ error: 'missing', partial: false });
    expect(addDocument).not.toHaveBeenCalled();
  });

  it('refuse un dossier incomplet ou mal formé sans rien enregistrer', async () => {
    const folder = { folderId, folderName: 'dossier', path: 'a.md' };
    const without = (key: string) =>
      Object.fromEntries(Object.entries(folder).filter(([name]) => name !== key));
    const refused = [
      without('folderId'),
      without('folderName'),
      without('path'),
      { ...folder, folderId: 'pas-un-uuid' },
      { ...folder, folderName: '   ' },
      { ...folder, folderName: 'x'.repeat(201) },
      { ...folder, path: '../secret.md' },
      { ...folder, path: 'a/./b.md' },
      { ...folder, path: 'a//b.md' },
      { ...folder, path: '/a.md' },
      { ...folder, path: `${'d/'.repeat(500)}a.md` },
    ];
    for (const fields of refused) {
      await expect(
        addFileAction(form({ file, ...fields })),
        JSON.stringify(fields),
      ).resolves.toEqual({
        error: 'missing',
        partial: false,
      });
    }

    expect(addDocument).not.toHaveBeenCalled();
  });

  it('rend le code de l’erreur du serveur, ou « failed » pour une autre', async () => {
    vi.mocked(addDocument).mockRejectedValueOnce(new DocumentError('folder_full'));
    await expect(
      addFileAction(form({ file, folderId, folderName: 'dossier', path: 'a.md' })),
    ).resolves.toEqual({ error: 'folder_full', partial: false });

    vi.mocked(addDocument).mockRejectedValueOnce(new Error('base indisponible'));
    await expect(addFileAction(form({ file }))).resolves.toEqual({
      error: 'failed',
      partial: false,
    });
  });
});

describe('deleteFolderAction', () => {
  it('supprime le dossier de l’auteur puis rafraîchit la liste', async () => {
    await deleteFolderAction(form({ id: folderId }));

    expect(deleteFolder).toHaveBeenCalledWith(ctx, folderId);
    expect(revalidatePath).toHaveBeenCalledWith('/documents');
  });

  it('ignore un identifiant qui n’est pas un uuid', async () => {
    await deleteFolderAction(form({ id: 'pas-un-uuid' }));

    expect(deleteFolder).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deleteDocumentAction', () => {
  it('supprime le document puis rafraîchit la liste', async () => {
    await deleteDocumentAction(form({ id: folderId }));

    expect(deleteDocument).toHaveBeenCalledWith(ctx, folderId);
    expect(revalidatePath).toHaveBeenCalledWith('/documents');
  });
});
