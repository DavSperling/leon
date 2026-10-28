'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { DocumentErrorCode } from '@/lib/documents';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  addDocument,
  DocumentError,
  deleteDocument,
  deleteFolder,
} from '@/server/documents/documents';
import { logError } from '@/server/log';

// `partial` : une partie du fichier n'a pas été lue (plafond de cellules, de PDF), le reste est indexé.
export type DocumentActionState = { error: DocumentErrorCode | null; partial: boolean };

async function storeFile(
  ctx: TenantContext,
  file: File,
  folder?: { id: string; name: string; path: string },
): Promise<DocumentActionState> {
  try {
    const { partial } = await addDocument(ctx, file, folder);
    return { error: null, partial };
  } catch (error) {
    // Ni le nom ni le contenu du fichier : le code de l'erreur, et la raison d'un échec de lecture.
    const known = error instanceof DocumentError ? error : null;
    logError('document.upload_failed', error, known?.reason ? { reason: known.reason } : {});
    return { error: known?.code ?? 'failed', partial: false };
  }
}

export async function uploadDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const ctx = await requireUserContext();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'missing', partial: false };
  const state = await storeFile(ctx, file);
  if (!state.error) revalidatePath('/documents');
  return state;
}

// Le dossier d'un fichier : les trois champs ensemble, ou aucun. `path` : son chemin sous le dossier, racine exclue.
const folderFields = z.object({
  folderId: z.uuid(),
  folderName: z.string().trim().min(1).max(200),
  path: z
    .string()
    .min(1)
    .max(1000)
    .refine((path) => path.split('/').every((part) => part && part !== '.' && part !== '..')),
});

// Appelée par la page fichier par fichier (un dossier en envoie jusqu'à 200) : elle ne rafraîchit pas la liste,
// la page le fait une fois l'envoi fini.
export async function addFileAction(formData: FormData): Promise<DocumentActionState> {
  const ctx = await requireUserContext();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'missing', partial: false };
  const fields = {
    folderId: formData.get('folderId'),
    folderName: formData.get('folderName'),
    path: formData.get('path'),
  };
  if (Object.values(fields).every((value) => value === null)) return storeFile(ctx, file);
  const folder = folderFields.safeParse(fields);
  if (!folder.success) return { error: 'missing', partial: false };
  const { folderId, folderName, path } = folder.data;
  return storeFile(ctx, file, { id: folderId, name: folderName, path });
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await deleteDocument(ctx, id.data);
  revalidatePath('/documents');
}

export async function deleteFolderAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await deleteFolder(ctx, id.data);
  revalidatePath('/documents');
}
