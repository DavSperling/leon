'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { searchTasksAction } from '@/app/(taches)/taches/actions';
import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from '@/lib/tasks/limits';
import type { ParentChoice } from '../create-draft';
import { safely } from '../safely';
import { Picker, type PickerSlot } from './picker';

const NONE = 'none';
const DEBOUNCE_MS = 200;

type ParentPickerProps = PickerSlot & {
  value: ParentChoice | null;
  onChange: (parent: ParentChoice | null) => void;
  taskId?: string; // la tâche dont on choisit le parent : elle ne peut pas l'être d'elle-même
};

// Recherche par identifiant ou par titre, côté serveur ; le menu garde les résultats précédents
// jusqu'à l'arrivée des nouveaux, et son filtre masque ceux qui ne correspondent plus.
export function ParentPicker({ value, onChange, taskId, ...slot }: ParentPickerProps) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ParentChoice[]>([]);
  const text = query.trim();
  // Au-delà de la borne du serveur, la recherche n'est pas lancée : elle ne ferait que refuser.
  const searching = text.length >= SEARCH_MIN_CHARS && text.length <= SEARCH_MAX_CHARS;

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
    ...(searching ? found.filter((task) => task.id !== value?.id && task.id !== taskId) : []),
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
