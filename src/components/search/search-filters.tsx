import { TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { ITEM_NATURES } from '@/capture/turn';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';
import { parseQuery } from '@/server/search/parse-query';
import { FilterMenu, type FilterMenuName, type FilterOption, FilterPerson } from './filter-menu';
import {
  type FilterKey,
  filterTokens,
  hasFilter,
  searchHref,
  withFilter,
  withoutFilter,
} from './url-state';
import { NATURE_LABELS, toolOptions } from './view-model';

// Les filtres de la recherche : ceux qui sont dans la requête, en puces qu'on retire d'un clic, et les menus qui
// en ajoutent. Tout passe par la requête (`outil:github`, `de:julie`…), la même que celle qu'on tape dans la
// barre : aucun état caché. Les filtres sont lus par `parseQuery`, qui reste la seule à dire ce qui est reconnu.

export type ActiveChip = {
  id: string;
  label: string;
  // Faux : la recherche ignore ce filtre (outil ou durée inconnus).
  recognized: boolean;
  removeHref: string;
  removeLabel: string;
};

const KEY_LABELS: Record<FilterKey, string> = {
  de: 'Personne',
  outil: 'Outil',
  type: 'Type',
  depuis: 'Depuis',
  avant: 'Avant',
};

const UNITS: Record<string, [string, string]> = {
  j: ['jour', 'jours'],
  s: ['semaine', 'semaines'],
  m: ['mois', 'mois'],
};

// `7j` → « 7 jours » ; une date → « 1 sept. 2026 ».
function sinceLabel(value: string, parsed: Date | undefined): string {
  const duration = /^(\d{1,4})([jsm])$/i.exec(value);
  if (duration) {
    const [one, many] = UNITS[(duration[2] as string).toLowerCase()] as [string, string];
    const amount = Number(duration[1]);
    return `${amount} ${amount === 1 ? one : many}`;
  }
  return parsed ? formatDate(parsed) : value;
}

// Ce que `parseQuery` comprend d'un seul filtre, pour l'écrire en français et savoir s'il compte.
function describeFilter(
  key: FilterKey,
  value: string,
  now: Date,
): { text: string; recognized: boolean } {
  const filters = parseQuery(`${key}:"${value}"`, now).filters;
  switch (key) {
    case 'de':
      return { text: value, recognized: true };
    case 'outil': {
      const kind = filters.tools?.[0];
      return { text: kind ? SOURCE_KIND_LABELS[kind] : value, recognized: kind !== undefined };
    }
    case 'type': {
      const nature = filters.natures?.[0];
      return { text: nature ? NATURE_LABELS[nature] : value, recognized: nature !== undefined };
    }
    case 'depuis':
      return { text: sinceLabel(value, filters.since), recognized: filters.since !== undefined };
    case 'avant':
      return {
        text: filters.until ? formatDate(filters.until) : value,
        recognized: filters.until !== undefined,
      };
  }
}

export function buildActiveChips(q: string, now: Date): ActiveChip[] {
  return filterTokens(q).map((token, index) => {
    const { text, recognized } = describeFilter(token.key, token.value, now);
    const label = `${KEY_LABELS[token.key]} : ${text}`;
    return {
      id: `${index}-${token.key}-${token.value}`,
      label,
      recognized,
      removeHref: searchHref({ q: withoutFilter(q, token.key, token.value) }),
      removeLabel: `Retirer le filtre « ${label} »`,
    };
  });
}

export type FilterMenuModel = { name: FilterMenuName; label: string; options: FilterOption[] };

const PERIODS: Array<{ value: string; label: string }> = [
  { value: '7j', label: '7 derniers jours' },
  { value: '30j', label: '30 derniers jours' },
  { value: '3m', label: '3 derniers mois' },
  { value: '12m', label: '12 derniers mois' },
];

// Choisir une entrée déjà cochée la retire : l'adresse de chaque entrée est celle de la recherche après le clic.
function option(q: string, key: FilterKey, value: string, label: string): FilterOption {
  const active = hasFilter(q, key, value);
  return {
    label,
    active,
    href: searchHref({ q: active ? withoutFilter(q, key, value) : withFilter(q, key, value) }),
  };
}

export function buildMenus(q: string): FilterMenuModel[] {
  return [
    {
      name: 'outil',
      label: 'Outil',
      options: toolOptions().map((tool) => option(q, 'outil', tool.value, tool.label)),
    },
    {
      name: 'type',
      label: 'Type',
      options: ITEM_NATURES.map((nature) => option(q, 'type', nature, NATURE_LABELS[nature])),
    },
    {
      name: 'periode',
      label: 'Période',
      options: PERIODS.map((period) => option(q, 'depuis', period.value, period.label)),
    },
  ];
}

export function SearchFilters({ q, now }: { q: string; now: Date }) {
  const chips = buildActiveChips(q, now);
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">Filtres</legend>
      {chips.map((chip) => (
        <span
          key={chip.id}
          title={chip.recognized ? undefined : 'Filtre non reconnu : la recherche l’ignore.'}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border pr-1 pl-3 text-[14px] leading-5',
            chip.recognized
              ? 'border-primary/20 bg-primary-soft text-primary'
              : 'border-warning/30 bg-warning-soft text-warning',
          )}
        >
          {!chip.recognized && <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" />}
          {chip.label}
          {!chip.recognized && <span className="sr-only"> (non reconnu, ignoré)</span>}
          <Link
            href={chip.removeHref}
            aria-label={chip.removeLabel}
            className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-foreground/10"
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </span>
      ))}
      {buildMenus(q).map((menu) => (
        <FilterMenu key={menu.name} name={menu.name} label={menu.label} options={menu.options} />
      ))}
      <FilterPerson query={q} />
    </fieldset>
  );
}
