'use client';

import { CalendarDays, ChevronDown, Layers, UserRound, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { searchHref, withFilter } from './url-state';

// Les menus de filtre. Choisir une entrée réécrit la requête (`outil:github` en tête) et relance la recherche :
// les adresses sont calculées par le serveur (search-filters.tsx), le menu ne fait que s'y rendre.

export type FilterOption = { label: string; active: boolean; href: string };
export type FilterMenuName = 'outil' | 'type' | 'periode';

const ICONS = { outil: Wrench, type: Layers, periode: CalendarDays } as const;

export function FilterMenu({
  name,
  label,
  options,
}: {
  name: FilterMenuName;
  label: string;
  options: FilterOption[];
}) {
  const router = useRouter();
  const Icon = ICONS[name];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-[14px]">
          <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
          {label}
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-56">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.label}
            checked={option.active}
            onSelect={() => router.push(option.href)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// « Personne » : un nom ou une adresse, que la recherche rapproche des membres de l'équipe. Une saisie, et non
// un menu : on ne liste pas l'équipe ici.
export function FilterPerson({ query }: { query: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = withFilter(query, 'de', value);
    setOpen(false);
    setValue('');
    if (q !== query) router.push(searchHref({ q }));
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 rounded-full px-3 text-[14px]"
      >
        <UserRound size={14} strokeWidth={1.5} aria-hidden="true" />
        Personne
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <label htmlFor="filtre-personne" className="sr-only">
        Nom ou adresse e-mail de la personne
      </label>
      <input
        ref={input}
        id="filtre-personne"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        maxLength={100}
        placeholder="Nom ou e-mail"
        autoComplete="off"
        className="h-8 w-44 rounded-full border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
      <Button type="submit" size="sm" className="h-8 rounded-full px-3 text-[14px]">
        Ajouter
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
        className="h-8 rounded-full px-2 text-[14px] text-muted-foreground"
      >
        Annuler
      </Button>
    </form>
  );
}
