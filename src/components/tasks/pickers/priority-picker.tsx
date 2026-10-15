'use client';

import { TASK_PRIORITIES, type TaskPriority } from '@/lib/enums';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import { PriorityIcon } from '../priority-icon';
import { Picker, type PickerSlot } from './picker';

// Comme Linear : 1 urgente, 2 haute, 3 moyenne, 4 basse, 0 sans priorité.
const SHORTCUTS = { urgent: '1', high: '2', medium: '3', low: '4', none: '0' } as const;

type PriorityPickerProps = PickerSlot & {
  value: TaskPriority | undefined;
  onChange: (priority: TaskPriority) => void;
};

export function PriorityPicker({ value, onChange, ...slot }: PriorityPickerProps) {
  return (
    <Picker
      label="Priorité"
      options={TASK_PRIORITIES.map((priority) => ({
        value: priority,
        label: PRIORITY_LABELS[priority],
        icon: <PriorityIcon priority={priority} />,
        shortcut: SHORTCUTS[priority],
        checked: priority === value,
      }))}
      onSelect={(next) => {
        const priority = TASK_PRIORITIES.find((candidate) => candidate === next);
        if (priority) onChange(priority);
      }}
      {...slot}
    />
  );
}
