'use client';

import { Check } from 'lucide-react';
import { type ReactElement, type ReactNode, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type PickerOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string; // texte discret à droite, cherché comme le libellé
  shortcut?: string; // une touche : choisit l'option tant que la recherche est vide
  checked?: boolean;
};

// Ce que chaque sélecteur accepte en plus de ses données : son déclencheur, et une ouverture
// qu'un raccourci clavier peut commander.
export type PickerSlot = {
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type PickerProps = PickerSlot & {
  label: string; // « Statut » : nomme le menu
  options: PickerOption[];
  onSelect: (value: string) => void;
  multiple?: boolean; // le menu reste ouvert, les options se cochent
  extra?: (search: string) => PickerOption[]; // options qui dépendent de la saisie
  onSearchChange?: (search: string) => void;
  emptyText?: string;
  // Hors de la commande : un champ de saisie y garde ses flèches et sa touche Entrée.
  footer?: (close: () => void) => ReactNode;
};

// Sans accents ni majuscules : « ete » trouve « Été ».
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function matching(options: PickerOption[], search: string): PickerOption[] {
  const needle = fold(search.trim());
  if (needle === '') return options;
  return options.filter((option) => fold(`${option.label} ${option.hint ?? ''}`).includes(needle));
}

function PickerItem({ option, onSelect }: { option: PickerOption; onSelect: () => void }) {
  return (
    <CommandItem
      value={option.value}
      onSelect={onSelect}
      aria-keyshortcuts={option.shortcut}
      className="gap-2 [&>svg:last-child]:hidden"
    >
      {option.icon && (
        <span aria-hidden="true" className="flex shrink-0">
          {option.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.hint && <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
      {option.shortcut && <CommandShortcut className="ml-0">{option.shortcut}</CommandShortcut>}
      {option.checked && (
        <>
          <Check size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
          <span className="sr-only">Sélectionné</span>
        </>
      )}
    </CommandItem>
  );
}

// Le gabarit de tous les sélecteurs : un menu flottant avec champ de recherche, des options avec
// icône et raccourci, la navigation aux flèches. Fermé ou ouvert par `open` quand un raccourci
// le commande, par son déclencheur sinon.
export function Picker({
  label,
  options,
  onSelect,
  multiple = false,
  extra,
  onSearchChange,
  emptyText = 'Aucun résultat.',
  footer,
  open,
  onOpenChange,
  children,
}: PickerProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isOpen = open ?? ownOpen;

  const changeSearch = (text: string) => {
    setSearch(text);
    onSearchChange?.(text);
  };
  const changeOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) changeSearch('');
  };
  const extraOptions = extra?.(search) ?? [];
  const choose = (value: string) => {
    onSelect(value);
    if (extraOptions.some((option) => option.value === value)) changeSearch('');
    if (!multiple) changeOpen(false);
  };
  const byShortcut = (key: string) =>
    search === '' ? options.find((option) => option.shortcut === key) : undefined;

  return (
    <Popover open={isOpen} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <Command
          shouldFilter={false}
          label={label}
          onKeyDown={(event) => {
            const option =
              event.metaKey || event.ctrlKey || event.altKey ? undefined : byShortcut(event.key);
            if (!option) return;
            event.preventDefault();
            choose(option.value);
          }}
        >
          <CommandInput value={search} onValueChange={changeSearch} placeholder="Rechercher…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {[...matching(options, search), ...extraOptions].map((option) => (
              <PickerItem
                key={option.value}
                option={option}
                onSelect={() => choose(option.value)}
              />
            ))}
          </CommandList>
        </Command>
        {footer?.(() => changeOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
