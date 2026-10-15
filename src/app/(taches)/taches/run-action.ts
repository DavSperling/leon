import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { logError } from '@/server/log';
import { TaskError } from '@/server/tasks/errors';

// Ce que les actions des tâches font toutes : la session, zod sur les entrées, une fonction de
// src/server/tasks, puis le rafraîchissement des pages. Le message d'une erreur attendue (TaskError)
// est fixe ; toute autre erreur est journalisée sans son message et le lecteur n'en voit rien. Le
// texte saisi (titre, description, commentaire, nom d'étiquette) ne passe ni dans un journal ni
// dans une réponse d'erreur.
export type ActionFailure = { ok: false; error: string };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

const INVALID_INPUT = 'Saisie invalide.';
const INTERNAL_ERROR = 'Erreur interne de Leon.';

type Work<S extends z.ZodType, T extends object> = (
  ctx: TenantContext,
  input: z.output<S>,
) => Promise<T>;

// `refresh` : les pages affichent des tâches, pas la lecture d'une recherche.
export async function run<S extends z.ZodType, T extends object>(
  name: string,
  schema: S,
  input: unknown,
  work: Work<S, T>,
  refresh = true,
): Promise<ActionResult<T>> {
  const ctx = await requireUserContext();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_INPUT };
  try {
    const result = await work(ctx, parsed.data);
    if (refresh) revalidatePath('/taches', 'layout');
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof TaskError) return { ok: false, error: error.message };
    logError(`tasks.${name}`, error);
    return { ok: false, error: INTERNAL_ERROR };
  }
}
