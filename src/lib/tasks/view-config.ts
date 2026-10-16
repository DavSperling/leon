// Réglages d'une vue de tâches : le même objet décrit l'URL (partageable) et une vue enregistrée.
import { z } from 'zod';
import {
  DUE_FILTERS,
  type DueFilter,
  TASK_PRIORITIES,
  TASK_STATUS_CATEGORIES,
  VIEW_GROUPINGS,
  VIEW_LAYOUTS,
  VIEW_ORDERINGS,
  VIEW_PROPERTIES,
  type ViewGrouping,
  type ViewLayout,
  type ViewOrdering,
  type ViewProperty,
} from '@/lib/enums';
import { SEARCH_MAX_CHARS } from './limits';

const Uuid = z.uuid();

export const ViewConfigSchema = z.strictObject({
  layout: z.enum(VIEW_LAYOUTS),
  groupBy: z.enum(VIEW_GROUPINGS),
  orderBy: z.enum(VIEW_ORDERINGS),
  properties: z.array(z.enum(VIEW_PROPERTIES)).max(VIEW_PROPERTIES.length),
  showSubtasks: z.boolean(),
  showEmptyGroups: z.boolean(),
  showBreakdown: z.boolean(),
  filters: z.strictObject({
    statuses: z.array(z.enum(TASK_STATUS_CATEGORIES)).max(TASK_STATUS_CATEGORIES.length), // vide : tous les statuts
    priority: z.enum(TASK_PRIORITIES).nullable(),
    assignee: z.union([z.enum(['me', 'none']), Uuid]).nullable(),
    creator: z.literal('me').nullable(),
    labelId: Uuid.nullable(),
    projectId: Uuid.nullable(),
    due: z.enum(DUE_FILTERS).nullable(),
    q: z.string().max(SEARCH_MAX_CHARS),
  }),
});
export type ViewConfig = z.infer<typeof ViewConfigSchema>;

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  layout: 'list',
  groupBy: 'status',
  orderBy: 'priority',
  properties: [
    'id',
    'status',
    'priority',
    'labels',
    'project',
    'assignee',
    'due_date',
    'subtasks',
    'parent',
  ],
  showSubtasks: true,
  showEmptyGroups: false,
  showBreakdown: false,
  filters: {
    statuses: ['backlog', 'todo', 'started'],
    priority: null,
    assignee: null,
    creator: null,
    labelId: null,
    projectId: null,
    due: null,
    q: '',
  },
};

// Paramètres de l'URL : ceux d'une page serveur (`searchParams`) ou ceux du navigateur.
export type ViewParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

// Valeur d'un paramètre dans l'URL, en français. `parse` rend undefined pour une valeur invalide.
type Codec<T> = { parse: (raw: string) => T | undefined; format: (value: T) => string };

const LAYOUT_CODES = { list: 'liste', board: 'tableau' } as const satisfies Record<
  ViewLayout,
  string
>;
const GROUPING_CODES = {
  status: 'statut',
  priority: 'priorite',
  assignee: 'assigne',
  project: 'projet',
  label: 'etiquette',
  none: 'aucun',
} as const satisfies Record<ViewGrouping, string>;
const ORDERING_CODES = {
  manual: 'manuel',
  priority: 'priorite',
  due_date: 'echeance',
  created: 'creation',
  updated: 'maj',
} as const satisfies Record<ViewOrdering, string>;
const PROPERTY_CODES = {
  id: 'id',
  status: 'statut',
  priority: 'priorite',
  labels: 'etiquettes',
  project: 'projet',
  assignee: 'assigne',
  due_date: 'echeance',
  subtasks: 'soustaches',
  parent: 'parent',
  status_age: 'anciennete',
  created: 'creation',
  updated: 'maj',
} as const satisfies Record<ViewProperty, string>;
const DUE_CODES = { overdue: 'retard', week: 'semaine', none: 'aucune' } as const satisfies Record<
  DueFilter,
  string
>;

function codeCodec<K extends string>(codes: Record<K, string>): Codec<K> {
  return {
    parse: (raw) => (Object.keys(codes) as K[]).find((key) => codes[key] === raw),
    format: (value) => codes[value],
  };
}

const enumCodec = <K extends string>(values: readonly K[]): Codec<K> => ({
  parse: (raw) => values.find((value) => value === raw),
  format: (value) => value,
});

// Une valeur vide efface le filtre : `assigne=` retire un filtre présent dans la vue de base.
const nullable = <T>(codec: Codec<T>): Codec<T | null> => ({
  parse: (raw) => (raw === '' ? null : codec.parse(raw)),
  format: (value) => (value === null ? '' : codec.format(value)),
});

// Liste séparée par des virgules, écrite dans l'ordre de `values` ; `emptyToken` écrit la liste vide.
function listCodec<K extends string>(
  values: readonly K[],
  codec: Codec<K>,
  emptyToken: string,
): Codec<K[]> {
  return {
    parse(raw) {
      if (raw === emptyToken) return [];
      const items = raw.split(',').map(codec.parse);
      if (items.includes(undefined)) return undefined;
      return values.filter((value) => items.includes(value));
    },
    format: (list) =>
      list.length === 0
        ? emptyToken
        : values
            .filter((value) => list.includes(value))
            .map(codec.format)
            .join(','),
  };
}

const flagCodec: Codec<boolean> = {
  parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
  format: (value) => (value ? '1' : '0'),
};
const textCodec: Codec<string> = {
  parse: (raw) => (raw.length <= SEARCH_MAX_CHARS ? raw : undefined),
  format: (value) => value,
};
const uuidCodec: Codec<string> = {
  parse: (raw) => (Uuid.safeParse(raw).success ? raw.toLowerCase() : undefined),
  format: (value) => value,
};
const assigneeCodec: Codec<string> = {
  parse: (raw) => (raw === 'moi' ? 'me' : raw === 'aucun' ? 'none' : uuidCodec.parse(raw)),
  format: (value) => (value === 'me' ? 'moi' : value === 'none' ? 'aucun' : value),
};

type Field<T> = {
  get: (config: ViewConfig) => T;
  set: (config: ViewConfig, value: T) => ViewConfig;
};

const setting = <K extends keyof ViewConfig>(key: K): Field<ViewConfig[K]> => ({
  get: (config) => config[key],
  set: (config, value) => ({ ...config, [key]: value }),
});

const filter = <K extends keyof ViewConfig['filters']>(
  key: K,
): Field<ViewConfig['filters'][K]> => ({
  get: (config) => config.filters[key],
  set: (config, value) => ({ ...config, filters: { ...config.filters, [key]: value } }),
});

type Param = {
  name: string;
  read: (raw: string, config: ViewConfig) => ViewConfig | undefined;
  write: (config: ViewConfig) => string;
};

function param<T>(name: string, codec: Codec<T>, field: Field<T>): Param {
  return {
    name,
    read(raw, config) {
      const value = codec.parse(raw);
      return value === undefined ? undefined : field.set(config, value);
    },
    write: (config) => codec.format(field.get(config)),
  };
}

const PARAMS: readonly Param[] = [
  param('disposition', codeCodec(LAYOUT_CODES), setting('layout')),
  param('groupe', codeCodec(GROUPING_CODES), setting('groupBy')),
  param('tri', codeCodec(ORDERING_CODES), setting('orderBy')),
  param('props', listCodec(VIEW_PROPERTIES, codeCodec(PROPERTY_CODES), ''), setting('properties')),
  param('soustaches', flagCodec, setting('showSubtasks')),
  param('vides', flagCodec, setting('showEmptyGroups')),
  param('repartition', flagCodec, setting('showBreakdown')),
  param(
    'statut',
    listCodec(TASK_STATUS_CATEGORIES, enumCodec(TASK_STATUS_CATEGORIES), 'tous'),
    filter('statuses'),
  ),
  param('priorite', nullable(enumCodec(TASK_PRIORITIES)), filter('priority')),
  param('assigne', nullable(assigneeCodec), filter('assignee')),
  param('createur', nullable(codeCodec({ me: 'moi' })), filter('creator')),
  param('etiquette', nullable(uuidCodec), filter('labelId')),
  param('projet', nullable(uuidCodec), filter('projectId')),
  param('echeance', nullable(codeCodec(DUE_CODES)), filter('due')),
  param('q', textCodec, filter('q')),
];

function readParam(params: ViewParamsInput, name: string): string | null {
  if (params instanceof URLSearchParams) return params.get(name);
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// Chaque paramètre absent prend la valeur de `base` (défaut d'équipe ou vue ouverte) ;
// un paramètre inconnu ou invalide est ignoré, jamais une erreur.
export function parseViewParams(params: ViewParamsInput, base: ViewConfig): ViewConfig {
  return PARAMS.reduce((config, p) => {
    const raw = readParam(params, p.name);
    return (raw === null ? undefined : p.read(raw, config)) ?? config;
  }, base);
}

// Les réglages valides de `params`, sous leur forme canonique, sans les comparer à une base : on ne
// connaît pas toujours le défaut d'équipe (le paramètre `retour` d'une tâche), et une valeur égale
// au défaut de Leon peut différer de celui de l'équipe. Les autres paramètres sont écartés.
export function validViewParams(params: ViewParamsInput): URLSearchParams {
  const valid = new URLSearchParams();
  for (const p of PARAMS) {
    const raw = readParam(params, p.name);
    const config = raw === null ? undefined : p.read(raw, DEFAULT_VIEW_CONFIG);
    if (config) valid.set(p.name, p.write(config));
  }
  return valid;
}

// Les seuls écarts à `base`, pour des URL courtes : `parseViewParams` les relit à l'identique.
export function toViewParams(config: ViewConfig, base: ViewConfig): URLSearchParams {
  const params = new URLSearchParams();
  for (const p of PARAMS) {
    const value = p.write(config);
    if (value !== p.write(base)) params.set(p.name, value);
  }
  return params;
}

export const sameConfig = (a: ViewConfig, b: ViewConfig): boolean =>
  PARAMS.every((p) => p.write(a) === p.write(b));
