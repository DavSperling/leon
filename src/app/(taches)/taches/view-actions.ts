'use server';

import { z } from 'zod';
import { VIEW_NAME_MAX_CHARS } from '@/lib/tasks/limits';
import { ViewConfigSchema } from '@/lib/tasks/view-config';
import { createView, deleteView, setTeamDefault, updateView } from '@/server/tasks/views';
import { type ActionResult, run } from './run-action';

// Les vues enregistrées. Seul l'auteur modifie ou supprime sa vue (updateView, deleteView) ; choisir
// le défaut de l'équipe est permis à tout membre, mais seulement parmi les vues d'équipe.

const Id = z.uuid();
const Name = z.string().trim().min(1).max(VIEW_NAME_MAX_CHARS);

const CreateViewSchema = z
  .strictObject({
    name: Name,
    config: ViewConfigSchema,
    team: z.boolean(),
    makeDefault: z.boolean().optional(),
  })
  .refine(({ team, makeDefault }) => team || !makeDefault);
const UpdateViewSchema = z.strictObject({
  id: Id,
  patch: z.strictObject({ name: Name.optional(), config: ViewConfigSchema.optional() }),
});
const ViewIdSchema = z.strictObject({ id: Id });

export async function createViewAction(
  input: z.input<typeof CreateViewSchema>,
): Promise<ActionResult<{ id: string }>> {
  return run('create_view', CreateViewSchema, input, async (ctx, data) => {
    const { id } = await createView(ctx, {
      name: data.name,
      config: data.config,
      team: data.team,
    });
    if (data.makeDefault) await setTeamDefault(ctx, id);
    return { id };
  });
}

export async function updateViewAction(
  id: string,
  patch: z.input<typeof UpdateViewSchema>['patch'],
): Promise<ActionResult> {
  return run('update_view', UpdateViewSchema, { id, patch }, async (ctx, data) => {
    await updateView(ctx, data.id, data.patch);
    return {};
  });
}

export async function deleteViewAction(id: string): Promise<ActionResult> {
  return run('delete_view', ViewIdSchema, { id }, async (ctx, data) => {
    await deleteView(ctx, data.id);
    return {};
  });
}

export async function setTeamDefaultAction(id: string): Promise<ActionResult> {
  return run('set_team_default', ViewIdSchema, { id }, async (ctx, data) => {
    await setTeamDefault(ctx, data.id);
    return {};
  });
}
