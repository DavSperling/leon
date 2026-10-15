'use client';

import type { Person } from '@/server/tasks/task-row';
import { Avatar } from '../avatar';
import { Picker, type PickerOption, type PickerSlot } from './picker';

const NONE = 'none';

type AssigneePickerProps = PickerSlot & {
  members: readonly Person[];
  viewerId: string;
  value: string | null;
  onChange: (assigneeId: string | null) => void;
};

// « Moi » en premier, puis « Aucun », puis les autres membres.
export function AssigneePicker({
  members,
  viewerId,
  value,
  onChange,
  ...slot
}: AssigneePickerProps) {
  const option = (
    id: string,
    label: string,
    person: Person | null,
    hint?: string,
  ): PickerOption => ({
    value: id,
    label,
    hint,
    icon: <Avatar person={person} />,
    checked: id === (value ?? NONE),
  });
  const me = members.find((member) => member.id === viewerId);
  return (
    <Picker
      label="Assigné"
      options={[
        ...(me ? [option(me.id, 'Moi', me, me.name)] : []),
        option(NONE, 'Aucun', null),
        ...members.filter((member) => member !== me).map((m) => option(m.id, m.name, m)),
      ]}
      onSelect={(next) => onChange(next === NONE ? null : next)}
      {...slot}
    />
  );
}
