'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dueSuggestions, formatDay } from '@/lib/tasks/dates';
import { Picker, type PickerSlot } from './picker';

const NONE = 'none';

type DueDatePickerProps = PickerSlot & {
  value: string | null; // « AAAA-MM-JJ »
  onChange: (date: string | null) => void;
  now: Date;
};

// Un champ de date natif ne se valide pas à chaque chiffre tapé : on attend OK ou Entrée.
// Le menu est dans un portail mais reste, pour React, sous le formulaire de création : sans
// stopPropagation, le submit de ce champ enverrait aussi la création.
function DateField({ onPick }: { onPick: (date: string) => void }) {
  const id = useId();
  const [date, setDate] = useState('');
  return (
    <form
      className="flex items-center gap-1.5 border-t p-2"
      onSubmit={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (date) onPick(date);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Autre date
      </label>
      <Input
        id={id}
        type="date"
        value={date}
        max="9999-12-31"
        onChange={(event) => setDate(event.target.value)}
        className="h-8 flex-1 text-xs md:text-xs"
      />
      <Button type="submit" size="sm" disabled={date === ''}>
        OK
      </Button>
    </form>
  );
}

export function DueDatePicker({ value, onChange, now, ...slot }: DueDatePickerProps) {
  const suggestions = dueSuggestions(now);
  return (
    <Picker
      label="Échéance"
      options={[
        ...suggestions.map(({ label, date }) => ({
          value: label,
          label,
          hint: formatDay(date),
          checked: date === value,
        })),
        { value: NONE, label: 'Aucune', checked: value === null },
      ]}
      onSelect={(selected) =>
        onChange(suggestions.find(({ label }) => label === selected)?.date ?? null)
      }
      footer={(close) => (
        <DateField
          onPick={(date) => {
            onChange(date);
            close();
          }}
        />
      )}
      {...slot}
    />
  );
}
