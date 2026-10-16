'use server';

import { z } from 'zod';
import { TASK_STATUS_CATEGORIES } from '@/lib/enums';
import {
  LABEL_NAME_MAX_CHARS,
  PROJECT_KEY_PATTERN,
  PROJECT_NAME_MAX_CHARS,
  STATUS_LABEL_MAX_CHARS,
} from '@/lib/tasks/limits';
import { projectKeyFrom } from '@/lib/tasks/ref';
import { deleteLabel, updateLabel } from '@/server/tasks/labels';
import { createProject, updateProject } from '@/server/tasks/projects';
import { createStatus, deleteStatus, moveStatus, updateStatus } from '@/server/tasks/statuses';
import { type ActionResult, run } from '../run-action';

// Les réglages des tâches : projets, statuts, étiquettes. Créer une étiquette passe par
// createLabelAction (../actions.ts), que les sélecteurs utilisent aussi.

const Id = z.uuid();
const Color = z.string().regex(/^#[0-9a-f]{6}$/);
const ProjectName = z.string().trim().min(1).max(PROJECT_NAME_MAX_CHARS);
const ProjectKey = z.string().trim().toUpperCase().regex(PROJECT_KEY_PATTERN);
const StatusLabel = z.string().trim().min(1).max(STATUS_LABEL_MAX_CHARS);
const Category = z.enum(TASK_STATUS_CATEGORIES);
const LabelName = z.string().trim().min(1).max(LABEL_NAME_MAX_CHARS);

// Sans clé, elle est tirée du nom (« Rénov'Ouest » → REN), comme pour le projet par défaut.
const NewProjectSchema = z.strictObject({ name: ProjectName, key: ProjectKey.optional() });
const ProjectPatchSchema = z.strictObject({
  id: Id,
  patch: z.strictObject({ name: ProjectName.optional(), key: ProjectKey.optional() }),
});
const NewStatusSchema = z.strictObject({
  projectId: Id,
  label: StatusLabel,
  color: Color,
  category: Category,
});
const StatusPatchSchema = z.strictObject({
  id: Id,
  patch: z.strictObject({
    label: StatusLabel.optional(),
    color: Color.optional(),
    category: Category.optional(),
  }),
});
const MoveStatusSchema = z.strictObject({ id: Id, direction: z.enum(['up', 'down']) });
const DeleteStatusSchema = z.strictObject({ id: Id, targetStatusId: Id });
const LabelPatchSchema = z.strictObject({
  id: Id,
  patch: z.strictObject({ name: LabelName.optional(), color: Color.optional() }),
});
const LabelIdSchema = z.strictObject({ id: Id });

export async function createProjectAction(
  input: z.input<typeof NewProjectSchema>,
): Promise<ActionResult> {
  return run('create_project', NewProjectSchema, input, async (ctx, data) => {
    await createProject(ctx, { name: data.name, key: data.key ?? projectKeyFrom(data.name) });
    return {};
  });
}

export async function updateProjectAction(
  id: string,
  patch: z.input<typeof ProjectPatchSchema>['patch'],
): Promise<ActionResult> {
  return run('update_project', ProjectPatchSchema, { id, patch }, async (ctx, data) => {
    await updateProject(ctx, data.id, data.patch);
    return {};
  });
}

export async function createStatusAction(
  input: z.input<typeof NewStatusSchema>,
): Promise<ActionResult> {
  return run('create_status', NewStatusSchema, input, async (ctx, data) => {
    await createStatus(ctx, data);
    return {};
  });
}

export async function updateStatusAction(
  id: string,
  patch: z.input<typeof StatusPatchSchema>['patch'],
): Promise<ActionResult> {
  return run('update_status', StatusPatchSchema, { id, patch }, async (ctx, data) => {
    await updateStatus(ctx, data.id, data.patch);
    return {};
  });
}

export async function moveStatusAction(
  id: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  return run('move_status', MoveStatusSchema, { id, direction }, async (ctx, data) => {
    await moveStatus(ctx, data.id, data.direction);
    return {};
  });
}

// Les tâches du statut supprimé passent à `targetStatusId`.
export async function deleteStatusAction(
  id: string,
  targetStatusId: string,
): Promise<ActionResult> {
  return run('delete_status', DeleteStatusSchema, { id, targetStatusId }, async (ctx, data) => {
    await deleteStatus(ctx, data.id, data.targetStatusId);
    return {};
  });
}

export async function updateLabelAction(
  id: string,
  patch: z.input<typeof LabelPatchSchema>['patch'],
): Promise<ActionResult> {
  return run('update_label', LabelPatchSchema, { id, patch }, async (ctx, data) => {
    await updateLabel(ctx, data.id, data.patch);
    return {};
  });
}

export async function deleteLabelAction(id: string): Promise<ActionResult> {
  return run('delete_label', LabelIdSchema, { id }, async (ctx, data) => {
    await deleteLabel(ctx, data.id);
    return {};
  });
}
