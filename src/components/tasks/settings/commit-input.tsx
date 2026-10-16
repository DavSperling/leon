'use client';

import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CommitInputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown'
> & {
  value: string; // la valeur enregistrée
  onCommit: (next: string) => Promise<boolean>; // false : refusé, le champ reprend `value`
};

// Un champ qui enregistre à la sortie ou sur Entrée, et revient à `value` sur Échap, sur une saisie
// vide ou sur un refus. Quand le serveur renvoie une autre valeur, la clé remonte le champ.
export function CommitInput({ value, onCommit, className, ...props }: CommitInputProps) {
  const commit = async (input: HTMLInputElement) => {
    const next = input.value.trim();
    if (next === value || next === '') {
      input.value = value;
      return;
    }
    if (!(await onCommit(next))) input.value = value;
  };
  return (
    <Input
      key={value}
      defaultValue={value}
      onBlur={(event) => void commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.value = value;
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
      className={cn('h-8', className)}
      {...props}
    />
  );
}
