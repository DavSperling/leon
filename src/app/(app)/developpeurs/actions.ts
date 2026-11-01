'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import { GITHUB_PROJECT, setRepoSharing, setSessionSharing } from '@/server/developpeurs/partage';

// Les boutons « Rendre privée » / « Partager » et l'interrupteur par dépôt. La règle (l'auteur seul) est en base.
const partage = z.enum(['0', '1']).transform((value) => value === '1');

export async function setSessionSharingAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const input = z
    .object({ id: z.uuid(), partage })
    .safeParse({ id: formData.get('id'), partage: formData.get('partage') });
  if (!input.success) return;
  await setSessionSharing(ctx, input.data.id, input.data.partage);
  revalidatePath('/developpeurs');
}

export async function setRepoSharingAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const input = z
    .object({ project: z.string().regex(GITHUB_PROJECT), partage })
    .safeParse({ project: formData.get('project'), partage: formData.get('partage') });
  if (!input.success) return;
  await setRepoSharing(ctx, input.data.project, input.data.partage);
  revalidatePath('/developpeurs');
}
