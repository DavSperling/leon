import { CalendarDays, Layers, type LucideIcon, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import { type FormEvent, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, Input, Pill, Tooltip,
} from '@/components';
import { activeFilters, type FilterKey, hasFilter, NATURE_OPTIONS, PERIOD_OPTIONS, TOOL_OPTIONS, withFilter, withoutFilter } from '@/data';
import { nb } from '@/lib';

export type FilterMenuName = 'outil' | 'type' | 'periode' | 'personne';

type MenuDef = { name: Exclude<FilterMenuName, 'personne'>; label: string; heading: string; icon: LucideIcon; key: FilterKey; options: Array<{ value: string; label: string }> };
// Sous 640 px, les menus perdent leur icône (le mot suffit) : les quatre tiennent sur une ligne à 390 px.
const NARROW = 'max-sm:[&>svg:first-child]:hidden';

const MENUS: MenuDef[] = [
  { name: 'outil', label: 'Outil', heading: 'Filtrer par outil', icon: Wrench, key: 'outil', options: TOOL_OPTIONS },
  { name: 'type', label: 'Type', heading: 'Filtrer par type', icon: Layers, key: 'type', options: NATURE_OPTIONS },
  { name: 'periode', label: 'Période', heading: 'Période', icon: CalendarDays, key: 'depuis', options: PERIOD_OPTIONS },
];

/**
 * Les filtres vivent dans la requête : les puces de ceux qui y sont (une croix les retire), puis les menus qui en
 * ajoutent. Aucun état caché : chaque choix réécrit `q`.
 */
export const Filters = memo(function Filters({ q, go, openMenu }: { q: string; go: (q: string) => void; openMenu: FilterMenuName | null }) {
  const chips = activeFilters(q);
  const row = useRef<HTMLFieldSetElement>(null);
  const refocus = useRef<number | null>(null);

  // La puce retirée disparaît : le focus passe à celle qui prend sa place (ou au premier menu), pas à <body>.
  useLayoutEffect(() => {
    const i = refocus.current;
    refocus.current = null;
    if (i !== null) row.current?.querySelectorAll<HTMLElement>('button')[i]?.focus({ preventScroll: true });
  }, [q]);

  return (
    <fieldset ref={row} className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 max-sm:gap-1.5">
      <legend className="sr-only">Filtres</legend>
      {chips.map((c, i) => {
        const label = nb(`Retirer le filtre « ${c.label} »${c.recognized ? '' : ' (non reconnu, ignoré)'}`);
        const pill = (
          <Pill
            key={`${c.key}:${c.value}`}
            variant={c.recognized ? 'active' : 'warning'}
            icon={c.recognized ? undefined : TriangleAlert}
            removable
            aria-label={label}
            onClick={() => ((refocus.current = i), go(c.removeQuery))}
          >
            {c.label}
          </Pill>
        );
        return c.recognized ? pill : <Tooltip key={`${c.key}:${c.value}`} content={nb('Filtre non reconnu : la recherche l’ignore.')}>{pill}</Tooltip>;
      })}
      {MENUS.map((m) => (
        <DropdownMenu key={m.name} defaultOpen={openMenu === m.name}>
          <DropdownMenuTrigger asChild><Pill icon={m.icon} chevron className={NARROW}>{m.label}</Pill></DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[min(380px,var(--radix-dropdown-menu-content-available-height))] w-[240px] overflow-y-auto">
            <DropdownMenuLabel>{m.heading}</DropdownMenuLabel>
            {m.options.map((o) => {
              const on = hasFilter(q, m.key, o.value);
              return (
                <DropdownMenuCheckboxItem key={o.value} checked={on} onCheckedChange={() => go(on ? withoutFilter(q, m.key, o.value) : withFilter(q, m.key, o.value))}>
                  {o.label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      <PersonFilter q={q} go={go} defaultOpen={openMenu === 'personne'} />
    </fieldset>
  );
});

/** « Personne » : un nom ou une adresse, que la recherche rapproche des membres de l'équipe. Une saisie, pas un menu. */
function PersonFilter({ q, go, defaultOpen }: { q: string; go: (q: string) => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true }); // fermé : le curseur revient au bouton
    wasOpen.current = open;
  }, [open]);

  const close = () => (setOpen(false), setValue(''));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = value.trim() ? withFilter(q, 'de', value.trim()) : q;
    close();
    if (next !== q) go(next);
  };

  if (!open) return <Pill ref={trigger} icon={UserRound} className={NARROW} onClick={() => setOpen(true)}>Personne</Pill>;
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <label htmlFor="filtre-personne" className="sr-only">Nom ou adresse e-mail de la personne</label>
      <span className="relative">
        <UserRound aria-hidden="true" strokeWidth={1.7} className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
        <Input
          ref={input}
          id="filtre-personne"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), close())}
          maxLength={100}
          placeholder="Nom ou e-mail"
          autoComplete="off"
          className="h-8 w-44 rounded-full pr-3 pl-8 text-label max-sm:w-36"
        />
      </span>
      {/* la barre garde le seul bouton principal de la vue */}
      <Button type="submit" size="sm">Ajouter</Button>
      <Button variant="ghost" size="sm" onClick={close}>Annuler</Button>
    </form>
  );
}
