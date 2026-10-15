'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { searchTasksAction } from '@/app/(taches)/taches/actions';
import type { ParentChoice } from '../create-draft';
import { safely } from '../safely';
import { Picker, type PickerSlot } from './picker';

const NONE = 'none';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

type ParentPickerProps = PickerSlot & {
  value: ParentChoice | null;
  onChange: (parent: ParentChoice | null) => void;
};

// Recherche par identifiant ou par titre, côté serveur ; le menu garde les résultats précédents
// jusqu'à l'arrivée des nouveaux, et son filtre masque ceux qui ne correspondent plus.
export function ParentPicker({ value, onChange, ...slot }: ParentPickerProps) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ParentChoice[]>([]);
  const text = query.trim();
  const searching = text.length >= MIN_CHARS;

  useEffect(() => {
    if (!searching) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await safely(searchTasksAction(text));
      if (!current) return;
      if (result.ok) setFound(result.tasks);
      else toast.error(result.error);
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [searching, text]);

  const choices = [
    ...(value ? [value] : []),
    ...(searching ? found.filter((task) => task.id !== value?.id) : []),
  ];
  return (
    <Picker
      label="Parent"
      options={[
        { value: NONE, label: 'Aucun', checked: value === null },
        ...choices.map((task) => ({
          value: task.id,
          label: task.title,
          hint: task.ref,
          checked: task.id === value?.id,
        })),
      ]}
      onSelect={(selected) => onChange(choices.find((task) => task.id === selected) ?? null)}
      onSearchChange={setQuery}
      emptyText={searching ? 'Aucune tâche trouvée.' : 'Tapez un titre ou un identifiant.'}
      {...slot}
    />
  );
}
