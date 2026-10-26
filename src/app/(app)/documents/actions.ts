'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { DocumentErrorCode } from '@/lib/documents';
import { requireUserContext } from '@/server/auth/session';
import { addDocument, DocumentError, deleteDocument } from '@/server/documents/documents';
import { logError } from '@/server/log';

// `partial` : une partie du fichier n'a pas été lue (plafond de cellules, de PDF), le reste est indexé.
export type DocumentActionState = { error: DocumentErrorCode | null; partial: boolean };

export async function uploadDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const ctx = await requireUserContext();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'missing', partial: false };
  try {
    const { partial } = await addDocument(ctx, file);
    revalidatePath('/documents');
    return { error: null, partial };
  } catch (error) {
    // Ni le nom ni le contenu du fichier : le code de l'erreur, et la raison d'un échec de lecture.
    const known = error instanceof DocumentError ? error : null;
    logError('document.upload_failed', error, known?.reason ? { reason: known.reason } : {});
    return { error: known?.code ?? 'failed', partial: false };
  }
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await deleteDocument(ctx, id.data);
  revalidatePath('/documents');
}
