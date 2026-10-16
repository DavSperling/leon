import { describe, expect, it } from 'vitest';
import {
  TASK_STATUS_CATEGORIES,
  type TaskStatusCategory,
  VIEW_PROPERTIES,
  type ViewProperty,
} from '@/lib/enums';
import {
  DEFAULT_VIEW_CONFIG,
  parseViewParams,
  sameConfig,
  toViewParams,
  type ViewConfig,
  ViewConfigSchema,
  validViewParams,
} from './view-config';

const LABEL_ID = '3f2b8c1e-52d4-4a8e-9b0f-7a1c6d5e4f30';
const PROJECT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const MEMBER_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';

const withFilters = (patch: Partial<ViewConfig['filters']>, rest: Partial<ViewConfig> = {}) => ({
  ...DEFAULT_VIEW_CONFIG,
  ...rest,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, ...patch },
});

// Une base qui diffère du défaut sur chaque réglage, comme le serait une vue enregistrée.
const OTHER_BASE: ViewConfig = {
  layout: 'board',
  groupBy: 'assignee',
  orderBy: 'manual',
  properties: ['id', 'status'],
  showSubtasks: false,
  showEmptyGroups: true,
  showBreakdown: true,
  filters: {
    statuses: ['done'],
    priority: 'high',
    assignee: 'me',
    creator: 'me',
    labelId: LABEL_ID,
    projectId: PROJECT_ID,
    due: 'week',
    q: 'ancienne recherche',
  },
};

const CONFIGS: Record<string, ViewConfig> = {
  défaut: DEFAULT_VIEW_CONFIG,
  'tableau par priorité': {
    ...DEFAULT_VIEW_CONFIG,
    layout: 'board',
    groupBy: 'priority',
    orderBy: 'due_date',
    properties: ['id', 'due_date', 'status_age', 'created', 'updated'],
    showSubtasks: false,
    showEmptyGroups: true,
    showBreakdown: true,
  },
  'tous les filtres': withFilters({
    statuses: ['started', 'done', 'canceled'],
    priority: 'urgent',
    assignee: MEMBER_ID,
    creator: 'me',
    labelId: LABEL_ID,
    projectId: PROJECT_ID,
    due: 'overdue',
    q: 'a&b=c é/ü #1 100%',
  }),
  'tous les statuts': withFilters({ statuses: [] }),
  'aucune propriété': { ...DEFAULT_VIEW_CONFIG, properties: [] },
  'sans assigné': withFilters({ assignee: 'none', due: 'none' }),
  'moi, sans filtre de statut': withFilters({ assignee: 'me', statuses: [] }, { groupBy: 'none' }),
  'recherche vide': withFilters({ q: '' }),
  'autre base': OTHER_BASE,
};

describe('ViewConfigSchema', () => {
  it('accepte le défaut', () => {
    expect(ViewConfigSchema.parse(DEFAULT_VIEW_CONFIG)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('refuse une clé inconnue, une valeur hors énumération et une recherche trop longue', () => {
    expect(ViewConfigSchema.safeParse({ ...DEFAULT_VIEW_CONFIG, extra: 1 }).success).toBe(false);
    expect(ViewConfigSchema.safeParse({ ...DEFAULT_VIEW_CONFIG, layout: 'calendar' }).success).toBe(
      false,
    );
    expect(ViewConfigSchema.safeParse(withFilters({ q: 'x'.repeat(101) })).success).toBe(false);
    expect(
      ViewConfigSchema.safeParse({
        ...DEFAULT_VIEW_CONFIG,
        filters: { ...DEFAULT_VIEW_CONFIG.filters, extra: 1 },
      }).success,
    ).toBe(false);
  });
});

describe('ViewConfigSchema, listes', () => {
  it('accepte chaque propriété et chaque catégorie, une fois', () => {
    const all = withFilters(
      { statuses: [...TASK_STATUS_CATEGORIES] },
      { properties: [...VIEW_PROPERTIES] },
    );
    expect(ViewConfigSchema.safeParse(all).success).toBe(true);
  });

  it('refuse une liste de propriétés ou de catégories plus longue que l’énumération', () => {
    const properties = Array<ViewProperty>(VIEW_PROPERTIES.length + 1).fill('id');
    const statuses = Array<TaskStatusCategory>(TASK_STATUS_CATEGORIES.length + 1).fill('todo');
    expect(ViewConfigSchema.safeParse({ ...DEFAULT_VIEW_CONFIG, properties }).success).toBe(false);
    expect(ViewConfigSchema.safeParse(withFilters({ statuses })).success).toBe(false);
  });
});

describe('toViewParams et parseViewParams', () => {
  describe.each([
    ['le défaut', DEFAULT_VIEW_CONFIG],
    ['une autre base', OTHER_BASE],
  ])('avec %s pour base', (_name, base) => {
    it.each(Object.entries(CONFIGS))('relit à l’identique : %s', (_label, config) => {
      const params = toViewParams(config, base);
      // Aller-retour par le texte de l'URL, comme dans le navigateur.
      const fromUrl = new URLSearchParams(params.toString());
      expect(parseViewParams(fromUrl, base)).toEqual(config);
    });
  });

  it('n’écrit rien quand la configuration est celle de la base', () => {
    expect(toViewParams(DEFAULT_VIEW_CONFIG, DEFAULT_VIEW_CONFIG).size).toBe(0);
    expect(toViewParams(OTHER_BASE, OTHER_BASE).size).toBe(0);
  });

  it('n’écrit que les écarts à la base, avec des valeurs en français', () => {
    const config = withFilters({ assignee: 'me' }, { layout: 'board', groupBy: 'priority' });
    expect(toViewParams(config, DEFAULT_VIEW_CONFIG).toString()).toBe(
      'disposition=tableau&groupe=priorite&assigne=moi',
    );
  });

  it('écrit « tous » pour aucun filtre de statut et « props= » pour aucune propriété', () => {
    const config = withFilters({ statuses: [] }, { properties: [] });
    expect(toViewParams(config, DEFAULT_VIEW_CONFIG).toString()).toBe('props=&statut=tous');
  });

  it('écrit un filtre vide pour effacer celui de la base', () => {
    const params = toViewParams(withFilters({ assignee: null }), withFilters({ assignee: 'me' }));
    expect(params.toString()).toBe('assigne=');
    expect(parseViewParams(params, withFilters({ assignee: 'me' })).filters.assignee).toBeNull();
  });

  it('prend la valeur de la base pour chaque paramètre absent', () => {
    expect(parseViewParams(new URLSearchParams(), OTHER_BASE)).toEqual(OTHER_BASE);
    const params = new URLSearchParams('groupe=statut');
    expect(parseViewParams(params, OTHER_BASE)).toEqual({ ...OTHER_BASE, groupBy: 'status' });
  });

  it('lit « statut=tous » et « props= »', () => {
    const config = parseViewParams(new URLSearchParams('statut=tous&props='), DEFAULT_VIEW_CONFIG);
    expect(config.filters.statuses).toEqual([]);
    expect(config.properties).toEqual([]);
  });

  it('range et dédoublonne les listes', () => {
    const params = new URLSearchParams('statut=started,backlog,backlog&props=maj,id,statut');
    const config = parseViewParams(params, DEFAULT_VIEW_CONFIG);
    expect(config.filters.statuses).toEqual(['backlog', 'started']);
    expect(config.properties).toEqual(['id', 'status', 'updated']);
  });

  it('ignore les paramètres inconnus et les valeurs invalides, sans erreur', () => {
    const params = new URLSearchParams({
      inconnu: 'x',
      vue: MEMBER_ID,
      onglet: 'activite',
      disposition: 'calendrier',
      groupe: 'priorite', // valide : seul réglage pris en compte
      tri: 'hasard',
      props: 'id,nope',
      soustaches: 'oui',
      vides: '2',
      repartition: '',
      statut: 'backlog,nope',
      priorite: 'critique',
      assigne: 'quelqu-un',
      createur: 'lui',
      etiquette: 'pas-un-uuid',
      projet: '123',
      echeance: 'demain',
      q: 'x'.repeat(101),
    });
    expect(parseViewParams(params, DEFAULT_VIEW_CONFIG)).toEqual({
      ...DEFAULT_VIEW_CONFIG,
      groupBy: 'priority',
    });
  });

  it('ignore un statut vide', () => {
    const config = parseViewParams(new URLSearchParams('statut='), DEFAULT_VIEW_CONFIG);
    expect(config.filters.statuses).toEqual(DEFAULT_VIEW_CONFIG.filters.statuses);
  });

  it('met les identifiants en minuscules', () => {
    const params = new URLSearchParams({ assigne: MEMBER_ID.toUpperCase() });
    expect(parseViewParams(params, DEFAULT_VIEW_CONFIG).filters.assignee).toBe(MEMBER_ID);
  });

  it('lit les searchParams d’une page serveur, valeur répétée comprise', () => {
    const config = parseViewParams(
      { disposition: 'tableau', groupe: ['aucun', 'statut'], tri: undefined, q: 'bug' },
      DEFAULT_VIEW_CONFIG,
    );
    expect(config).toEqual(withFilters({ q: 'bug' }, { layout: 'board', groupBy: 'none' }));
  });
});

describe('validViewParams', () => {
  it('garde les réglages valides sous leur forme canonique, dans l’ordre des paramètres', () => {
    const params = new URLSearchParams({
      groupe: 'priorite',
      disposition: 'tableau',
      assigne: MEMBER_ID.toUpperCase(),
      statut: 'started,backlog',
    });
    expect(validViewParams(params).toString()).toBe(
      `disposition=tableau&groupe=priorite&statut=backlog%2Cstarted&assigne=${MEMBER_ID}`,
    );
  });

  it('écarte les paramètres inconnus, de page et les valeurs invalides', () => {
    const params = new URLSearchParams(
      `vue=${MEMBER_ID}&onglet=activite&inconnu=1&groupe=zzz&q=${'x'.repeat(101)}&//exemple.com`,
    );
    expect(validViewParams(params).size).toBe(0);
  });

  it('garde une valeur égale au défaut de Leon : l’équipe en a peut-être un autre', () => {
    expect(
      validViewParams(new URLSearchParams('groupe=statut&props=&statut=tous')).toString(),
    ).toBe('groupe=statut&props=&statut=tous');
  });

  it('relit à l’identique, quelle que soit la base', () => {
    const params = new URLSearchParams('disposition=liste&tri=echeance&assigne=&bruit=1&groupe=x');
    for (const base of [DEFAULT_VIEW_CONFIG, OTHER_BASE]) {
      expect(parseViewParams(validViewParams(params), base)).toEqual(parseViewParams(params, base));
    }
  });

  it('lit les searchParams d’une page serveur', () => {
    const params = { groupe: ['aucun', 'statut'], tri: undefined, q: 'bug' };
    expect(validViewParams(params).toString()).toBe('groupe=aucun&q=bug');
  });
});

describe('sameConfig', () => {
  it('reconnaît deux configurations égales', () => {
    expect(sameConfig(DEFAULT_VIEW_CONFIG, structuredClone(DEFAULT_VIEW_CONFIG))).toBe(true);
  });

  it('ne tient pas compte de l’ordre des listes', () => {
    const a = { ...DEFAULT_VIEW_CONFIG, properties: ['status', 'id'] as ViewConfig['properties'] };
    const b = { ...DEFAULT_VIEW_CONFIG, properties: ['id', 'status'] as ViewConfig['properties'] };
    expect(sameConfig(a, b)).toBe(true);
  });

  it('voit la moindre différence', () => {
    expect(sameConfig(DEFAULT_VIEW_CONFIG, { ...DEFAULT_VIEW_CONFIG, layout: 'board' })).toBe(
      false,
    );
    expect(sameConfig(DEFAULT_VIEW_CONFIG, withFilters({ q: 'a' }))).toBe(false);
    expect(sameConfig(DEFAULT_VIEW_CONFIG, withFilters({ statuses: [] }))).toBe(false);
    expect(sameConfig(DEFAULT_VIEW_CONFIG, { ...DEFAULT_VIEW_CONFIG, properties: [] })).toBe(false);
  });
});
