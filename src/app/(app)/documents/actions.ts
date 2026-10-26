'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import { addDocument, DOCUMENT_UPLOAD_ERROR, deleteDocument } from '@/server/documents/documents';

export type DocumentActionState = { error: string | null };
const DOCUMENT_SAVE_ERROR = 'Impossible d’enregistrer ce document. Réessayez.';

export async function uploadDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const ctx = await requireUserContext();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Choisissez un fichier à ajouter.' };
  try {
    await addDocument(ctx, file);
    revalidatePath('/documents');
    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return {
      error: [
        DOCUMENT_UPLOAD_ERROR,
        'Aucun texte lisible dans ce fichier.',
        'Ce document contient trop de texte (maximum 1 million de caractères).',
      ].includes(message)
        ? message
        : DOCUMENT_SAVE_ERROR,
    };
  }
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await deleteDocument(ctx, id.data);
  revalidatePath('/documents');
}
