'use client';

import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createLabelAction } from '@/app/(taches)/taches/actions';
import { nextColor } from '@/lib/tasks/palette';
import type { LabelRow } from '@/server/tasks/labels';
import { LabelDot } from '../label-chip';
import { safely } from '../safely';
import { Picker, type PickerOption, type PickerSlot } from './picker';

const NEW_PREFIX = 'new:';
const NAME_MAX_CHARS = 40;

type LabelsPickerProps = PickerSlot & {
  labels: readonly LabelRow[];
  value: readonly string[]; // identifiants des étiquettes posées
  onToggle: (label: LabelRow, selected: boolean) => void;
};

// Les étiquettes se cochent sans fermer le menu. Une saisie qui ne correspond à aucun nom
// propose de créer l'étiquette, puis la pose.
export function LabelsPicker({ labels, value, onToggle, ...slot }: LabelsPickerProps) {
  const create = async (name: string) => {
    const color = nextColor(labels.map((label) => label.color));
    const result = await safely(createLabelAction({ name, color }));
    if (result.ok) onToggle(result.label, true);
    else toast.error(result.error);
  };
  const creatable = (search: string): PickerOption[] => {
    const name = search.trim();
    const exists = labels.some((label) => label.name.toLowerCase() === name.toLowerCase());
    if (name === '' || name.length > NAME_MAX_CHARS || exists) return [];
    return [
      {
        value: `${NEW_PREFIX}${name}`,
        label: `Créer l'étiquette « ${name} »`,
        icon: <Plus size={14} strokeWidth={1.5} aria-hidden="true" />,
      },
    ];
  };
  return (
    <Picker
      label="Étiquettes"
      multiple
      options={labels.map((label) => ({
        value: label.id,
        label: label.name,
        icon: <LabelDot color={label.color} className="size-2.5" />,
        checked: value.includes(label.id),
      }))}
      extra={creatable}
      onSelect={(selected) => {
        if (selected.startsWith(NEW_PREFIX)) return void create(selected.slice(NEW_PREFIX.length));
        const label = labels.find((candidate) => candidate.id === selected);
        if (label) onToggle(label, !value.includes(label.id));
      }}
      {...slot}
    />
  );
}
