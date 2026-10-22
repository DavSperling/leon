'use client';

import { CalendarDays, Layers, UserRound, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Pill,
} from '@/components/verre';
import { searchHref, withFilter } from './url-state';

// Les menus de filtre. Choisir une entrée réécrit la requête (`outil:github` en tête) et relance la recherche :
// les adresses sont calculées par le serveur (search-filters.tsx), le menu ne fait que s'y rendre.

export type FilterOption = { label: string; active: boolean; href: string };
export type FilterMenuName = 'outil' | 'type' | 'periode';

const ICONS = { outil: Wrench, type: Layers, periode: CalendarDays } as const;
const HEADINGS = {
  outil: 'Filtrer par outil',
  type: 'Filtrer par type',
  periode: 'Période',
} as const;
// Sous 640 px, les menus perdent leur icône (le mot suffit) : les quatre tiennent sur une ligne à 390 px.
const NARROW = 'max-sm:[&>svg:first-child]:hidden';

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pill icon={ICONS[name]} chevron className={NARROW}>
          {label}
        </Pill>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[min(380px,var(--radix-dropdown-menu-content-available-height))] w-[240px] overflow-y-auto">
        <DropdownMenuLabel>{HEADINGS[name]}</DropdownMenuLabel>
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
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true }); // fermé : le curseur revient au bouton
    wasOpen.current = open;
  }, [open]);

  const close = () => {
    setOpen(false);
    setValue('');
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = withFilter(query, 'de', value);
    close();
    if (q !== query) router.push(searchHref({ q }));
  }

  if (!open) {
    return (
      <Pill ref={trigger} icon={UserRound} className={NARROW} onClick={() => setOpen(true)}>
        Personne
      </Pill>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <label htmlFor="filtre-personne" className="sr-only">
        Nom ou adresse e-mail de la personne
      </label>
      <span className="relative">
        <UserRound
          aria-hidden="true"
          strokeWidth={1.7}
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted"
        />
        <Input
          ref={input}
          id="filtre-personne"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          maxLength={100}
          placeholder="Nom ou e-mail"
          autoComplete="off"
          className="h-8 w-44 rounded-full pr-3 pl-8 text-label max-sm:w-36"
        />
      </span>
      {/* la barre garde le seul bouton principal de la vue */}
      <Button type="submit" size="sm">
        Ajouter
      </Button>
      <Button variant="ghost" size="sm" onClick={close}>
        Annuler
      </Button>
    </form>
  );
}
