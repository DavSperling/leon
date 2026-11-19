import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type BackstageRole, OFFERED_NATURES } from '@/capture/turn';
import { Tooltip } from '@/components/verre/ui/menu';
import { Pill } from '@/components/verre/ui/pill';
import { formatDate } from '@/lib/format';
import { NATURE_LABELS_EN, SOURCE_KIND_LABELS } from '@/lib/labels';
import { BACKSTAGE_ROLE_NAMES_EN, parseQuery } from '@/server/search/parse-query';
import { FilterMenu, type FilterMenuName, type FilterOption, FilterPerson } from './filter-menu';
import {
  type CanonicalKey,
  canonicalKey,
  type FilterKey,
  filterTokens,
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

// Les rôles des coulisses que `type:` lit aussi (parse-query.ts). Seuls les appels d'outils ont une entrée de menu : la
// recherche ne les rend que demandés (décision d'Amos du 18/11) ; le raisonnement et les sous-agents viennent sans filtre.
const ROLE_LABELS: Record<BackstageRole, string> = {
  raisonnement: 'Raisonnement',
  sous_agent: 'Sous-agent',
  appel_outil: 'Appels d’outils',
};
const ROLE_LABELS_EN: Record<BackstageRole, string> = {
  raisonnement: 'Reasoning',
  sous_agent: 'Subagent',
  appel_outil: 'Tool calls',
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
      const role = filters.roles?.[0];
      const en = locale === 'en';
      if (role) return { text: (en ? ROLE_LABELS_EN : ROLE_LABELS)[role], recognized: true };
      const labels = en ? NATURE_LABELS_EN : NATURE_LABELS;
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

// Ce que `parseQuery` lit dans un filtre d'une seule valeur.
const filtersOf = (key: CanonicalKey, value: string, now: Date) =>
  parseQuery(`${key}:"${value}"`, now).filters;

// Le sens d'un `outil:` ou d'un `type:`, quel que soit le nom écrit : les identifiants d'outil, de nature et de rôle ne
// se croisent pas.
function meaning(key: CanonicalKey, value: string, now: Date): string | undefined {
  const { tools, natures, roles } = filtersOf(key, value, now);
  return tools?.[0] ?? natures?.[0] ?? roles?.[0];
}

// La requête sans ses filtres de cette clé dont la valeur vérifie `test`.
function withoutKind(q: string, key: CanonicalKey, test: (value: string) => boolean): string {
  return filterTokens(q)
    .filter((token) => canonicalKey(token.key) === key && test(token.value))
    .reduce((rest, token) => withoutFilter(rest, token.key, token.value), q);
}

// Choisir une entrée déjà cochée la retire : l'adresse de chaque entrée est celle de la recherche après le clic. Une
// entrée non cochée s'ajoute à `base` (la requête, ou la requête sans les filtres qu'elle ne peut pas croiser). C'est le
// sens qui compte, pas le mot : `type:"tool call"` coche « Appels d’outils » sur le site français, `outil:note` coche
// « Note », et décocher retire le filtre sous tous ses noms. La période n'a qu'une valeur : elle est cochée si c'est la
// date que la recherche retient (la dernière valide), et cocher ou décocher retire toutes les périodes (une période n'a
// pas de sens à comparer : `meaning` ne rend rien, tous ses filtres partent).
function option(
  q: string,
  key: FilterKey,
  value: string,
  label: string,
  now: Date,
  base = q,
): FilterOption {
  const kind = canonicalKey(key);
  const single = kind === 'depuis';
  const sense = meaning(kind, value, now);
  const removed = withoutKind(q, kind, (written) => meaning(kind, written, now) === sense);
  const retained = parseQuery(q, now).filters.since?.getTime();
  const active = single ? retained === filtersOf(kind, value, now).since?.getTime() : removed !== q;
  return {
    label,
    active,
    href: searchHref({ q: active ? removed : withFilter(single ? removed : base, key, value) }),
  };
}

// En anglais, les menus écrivent les filtres anglais (`tool:github`, `type:meeting`, `since:7d`).
export function buildMenus(q: string, locale = 'fr', now = new Date()): FilterMenuModel[] {
  const en = locale === 'en';
  // Une nature et les appels d'outils se croisent (un ticket n'a jamais d'appels) : chaque entrée retire l'autre sorte.
  const noRoles = withoutKind(
    q,
    'type',
    (value) => filtersOf('type', value, now).roles !== undefined,
  );
  const noNatures = withoutKind(
    q,
    'type',
    (value) => filtersOf('type', value, now).natures !== undefined,
  );
  return [
    {
      name: 'outil',
      label: en ? 'Tool' : 'Outil',
      options: toolOptions().map((tool) =>
        option(q, en ? 'tool' : 'outil', tool.value, tool.label, now),
      ),
    },
    {
      name: 'type',
      label: 'Type',
      options: [
        ...OFFERED_NATURES.map((nature) =>
          en
            ? option(
                q,
                'type',
                NATURE_LABELS_EN[nature].toLowerCase(),
                NATURE_LABELS_EN[nature],
                now,
                noRoles,
              )
            : option(q, 'type', nature, NATURE_LABELS[nature], now, noRoles),
        ),
        en
          ? option(
              q,
              'type',
              BACKSTAGE_ROLE_NAMES_EN.appel_outil,
              ROLE_LABELS_EN.appel_outil,
              now,
              noNatures,
            )
          : option(q, 'type', 'appel_outil', ROLE_LABELS.appel_outil, now, noNatures),
      ],
    },
    {
      name: 'periode',
      label: en ? 'Date' : 'Période',
      options: (en ? PERIODS_EN : PERIODS).map((period) =>
        option(q, en ? 'since' : 'depuis', period.value, period.label, now),
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
      {buildMenus(q, locale, now).map((menu) => (
        <FilterMenu key={menu.name} name={menu.name} label={menu.label} options={menu.options} />
      ))}
      <FilterPerson query={q} locale={locale} />
    </fieldset>
  );
}
