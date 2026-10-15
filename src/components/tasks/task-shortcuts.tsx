'use client';

import { moveRowFocus, openAimedRow, openPicker } from './row-targets';
import { useTaskShortcuts } from './use-task-shortcuts';

// Les touches qui visent une tâche : J et K (ou les flèches) passent de l'une à l'autre, Entrée
// l'ouvre, S P A L D changent ses propriétés. À poser dans toute page qui en montre ou en ouvre une.
export function TaskShortcuts() {
  useTaskShortcuts({
    next: () => moveRowFocus(1),
    previous: () => moveRowFocus(-1),
    open: openAimedRow,
    status: () => openPicker('status'),
    priority: () => openPicker('priority'),
    assignee: () => openPicker('assignee'),
    labels: () => openPicker('labels'),
    due: () => openPicker('due'),
  });
  return null;
}
