'use client';

import type { StatusRow } from '@/server/tasks/statuses';
import { StatusIcon } from '../status-icon';
import { Picker, type PickerSlot } from './picker';

type StatusPickerProps = PickerSlot & {
  statuses: readonly StatusRow[]; // ceux du projet de la tâche, rangés comme listStatuses
  value: string | undefined;
  onChange: (statusId: string) => void;
};

// Les neuf premiers statuts se choisissent par leur numéro.
export function StatusPicker({ statuses, value, onChange, ...slot }: StatusPickerProps) {
  return (
    <Picker
      label="Statut"
      options={statuses.map((status, index) => ({
        value: status.id,
        label: status.label,
        icon: <StatusIcon category={status.category} color={status.color} />,
        shortcut: index < 9 ? String(index + 1) : undefined,
        checked: status.id === value,
      }))}
      onSelect={onChange}
      {...slot}
    />
  );
}
