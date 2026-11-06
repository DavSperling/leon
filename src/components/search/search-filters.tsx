import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { OFFERED_NATURES } from '@/capture/turn';
import { Tooltip } from '@/components/verre/ui/menu';
import { Pill } from '@/components/verre/ui/pill';
import { formatDate } from '@/lib/format';
import { NATURE_LABELS_EN, SOURCE_KIND_LABELS } from '@/lib/labels';
import { parseQuery } from '@/server/search/parse-query';
import { FilterMenu, type FilterMenuName, type FilterOption, FilterPerson } from './filter-menu';
import {
  type CanonicalKey,
  canonicalKey,
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

const KEY_LABELS: Record<CanonicalKey, string> = {
  de: 'Personne',
  outil: 'Outil',
  type: 'Type',
  depuis: 'Depuis',
  avant: 'Avant',
};
const KEY_LABELS_EN: Record<CanonicalKey, string> = {
  de: 'Person',
  outil: 'Tool',
  type: 'Type',
  depuis: 'Since',
  avant: 'Before',
};

// Les unités de `depuis:` : françaises (7j, 2s, 3m) ou anglaises (7d, 2w, 3mo), que la recherche lit toutes.
const UNIT_OF: Record<string, string> = { d: 'j', w: 's', mo: 'm' };
const UNITS: Record<string, [string, string]> = {
  j: ['jour', 'jours'],
  s: ['semaine', 'semaines'],
  m: ['mois', 'mois'],
};
const UNITS_EN: Record<string, [string, string]> = {
  j: ['day', 'days'],
  s: ['week', 'weeks'],
  m: ['month', 'months'],
};

// `7j` → « 7 jours » ; une date → « 1 sept. 2026 ».
function sinceLabel(value: string, parsed: Date | undefined, locale: string): string {
  const duration = /^(\d{1,4})(mo|[jsmdw])$/i.exec(value);
  if (duration) {
    const unit = (duration[2] as string).toLowerCase();
    const [one, many] = (locale === 'en' ? UNITS_EN : UNITS)[UNIT_OF[unit] ?? unit] as [
      string,
      string,
    ];
    const amount = Number(duration[1]);
    return `${amount} ${amount === 1 ? one : many}`;
  }
  return parsed ? formatDate(parsed, locale) : value;
}

// Ce que `parseQuery` comprend d'un seul filtre, pour l'écrire dans la langue de l'interface et savoir s'il compte.
function describeFilter(
  key: CanonicalKey,
  value: string,
  now: Date,
  locale: string,
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
      const labels = locale === 'en' ? NATURE_LABELS_EN : NATURE_LABELS;
      return { text: nature ? labels[nature] : value, recognized: nature !== undefined };
    }
    case 'depuis':
      return {
        text: sinceLabel(value, filters.since, locale),
        recognized: filters.since !== undefined,
      };
    case 'avant':
      return {
        text: filters.until ? formatDate(filters.until, locale) : value,
        recognized: filters.until !== undefined,
      };
  }
}

export function buildActiveChips(q: string, now: Date, locale = 'fr'): ActiveChip[] {
  return filterTokens(q).map((token, index) => {
    const key = canonicalKey(token.key);
    const { text, recognized } = describeFilter(key, token.value, now, locale);
    const label =
      locale === 'en' ? `${KEY_LABELS_EN[key]}: ${text}` : `${KEY_LABELS[key]} : ${text}`;
    return {
      id: `${index}-${token.key}-${token.value}`,
      label,
      recognized,
      removeHref: searchHref({ q: withoutFilter(q, token.key, token.value) }),
      removeLabel: locale === 'en' ? `Remove filter “${label}”` : `Retirer le filtre « ${label} »`,
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
const PERIODS_EN: Array<{ value: string; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '3mo', label: 'Last 3 months' },
  { value: '12mo', label: 'Last 12 months' },
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

// En anglais, les menus écrivent les filtres anglais (`tool:github`, `type:meeting`, `since:7d`).
export function buildMenus(q: string, locale = 'fr'): FilterMenuModel[] {
  const en = locale === 'en';
  return [
    {
      name: 'outil',
      label: en ? 'Tool' : 'Outil',
      options: toolOptions().map((tool) =>
        option(q, en ? 'tool' : 'outil', tool.value, tool.label),
      ),
    },
    {
      name: 'type',
      label: 'Type',
      options: OFFERED_NATURES.map((nature) =>
        en
          ? option(q, 'type', NATURE_LABELS_EN[nature].toLowerCase(), NATURE_LABELS_EN[nature])
          : option(q, 'type', nature, NATURE_LABELS[nature]),
      ),
    },
    {
      name: 'periode',
      label: en ? 'Date' : 'Période',
      options: (en ? PERIODS_EN : PERIODS).map((period) =>
        option(q, en ? 'since' : 'depuis', period.value, period.label),
      ),
    },
  ];
}

export function SearchFilters({ q, now }: { q: string; now: Date }) {
  const locale = useLocale();
  const t = useTranslations('filters');
  const chips = buildActiveChips(q, now, locale);
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 max-sm:gap-1.5">
      <legend className="sr-only">{t('filters')}</legend>
      {chips.map((chip) => {
        // Toute la pastille retire le filtre : un lien vers la recherche sans lui.
        const pill = (
          <Pill
            key={chip.id}
            asChild
            variant={chip.recognized ? 'active' : 'warning'}
            icon={chip.recognized ? undefined : TriangleAlert}
            removable
          >
            <Link
              href={chip.removeHref}
              aria-label={`${chip.removeLabel}${chip.recognized ? '' : t('unrecognizedSuffix')}`}
            >
              {chip.label}
            </Link>
          </Pill>
        );
        return chip.recognized ? (
          pill
        ) : (
          <Tooltip key={chip.id} content={t('unrecognized')}>
            {pill}
          </Tooltip>
        );
      })}
      {buildMenus(q, locale).map((menu) => (
        <FilterMenu key={menu.name} name={menu.name} label={menu.label} options={menu.options} />
      ))}
      <FilterPerson query={q} locale={locale} />
    </fieldset>
  );
}
