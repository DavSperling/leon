import { describe, expect, it } from 'vitest';
import { ITEM_NATURES, OFFERED_NATURES, TOOL_KINDS } from '@/capture/turn';
import { parseQuery } from '@/server/search/parse-query';
import { EXAMPLES, EXAMPLES_EN, SYNTAX, SYNTAX_EN } from './examples';
import { buildActiveChips, buildMenus } from './search-filters';
import { FILTER_KEYS, fromSearchParams } from './url-state';

const NOW = new Date('2026-10-19T10:00:00Z');

const chips = (q: string) =>
  buildActiveChips(q, NOW).map(({ label, recognized, removeHref }) => ({
    label,
    recognized,
    removeHref,
  }));

describe('buildActiveChips', () => {
  it('ne rend rien pour une requête sans filtre', () => {
    expect(chips('budget')).toEqual([]);
    expect(chips('')).toEqual([]);
  });

  it('nomme chaque filtre en français et donne l’adresse de la recherche sans lui', () => {
    expect(chips('call de:julie outil:github type:réunion depuis:7j')).toEqual([
      {
        label: 'Personne : julie',
        recognized: true,
        removeHref: '/?q=call+outil%3Agithub+type%3Ar%C3%A9union+depuis%3A7j',
      },
      {
        label: 'Outil : GitHub',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+type%3Ar%C3%A9union+depuis%3A7j',
      },
      {
        label: 'Type : Réunion',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+outil%3Agithub+depuis%3A7j',
      },
      {
        label: 'Depuis : 7 jours',
        recognized: true,
        removeHref: '/?q=call+de%3Ajulie+outil%3Agithub+type%3Ar%C3%A9union',
      },
    ]);
  });

  it('écrit la durée et la date comme on les lit', () => {
    expect(chips('depuis:1j').map((c) => c.label)).toEqual(['Depuis : 1 jour']);
    expect(chips('depuis:2s').map((c) => c.label)).toEqual(['Depuis : 2 semaines']);
    expect(chips('depuis:3m').map((c) => c.label)).toEqual(['Depuis : 3 mois']);
    expect(chips('depuis:2026-09-01').map((c) => c.label)).toEqual(['Depuis : 1 sept. 2026']);
    expect(chips('avant:2026-10-01').map((c) => c.label)).toEqual(['Avant : 1 oct. 2026']);
  });

  it('retire le dernier filtre sans laisser une requête vide en adresse', () => {
    expect(chips('outil:github')[0]?.removeHref).toBe('/');
  });

  it('garde un filtre inconnu, marqué comme non reconnu, pour qu’on puisse le retirer', () => {
    expect(chips('outil:inconnu type:truc depuis:bientot avant:demain x')).toEqual([
      {
        label: 'Outil : inconnu',
        recognized: false,
        removeHref: '/?q=type%3Atruc+depuis%3Abientot+avant%3Ademain+x',
      },
      {
        label: 'Type : truc',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+depuis%3Abientot+avant%3Ademain+x',
      },
      {
        label: 'Depuis : bientot',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+type%3Atruc+avant%3Ademain+x',
      },
      {
        label: 'Avant : demain',
        recognized: false,
        removeHref: '/?q=outil%3Ainconnu+type%3Atruc+depuis%3Abientot+x',
      },
    ]);
  });

  it('reconnaît un outil par son libellé comme par son identifiant', () => {
    expect(chips('outil:"Claude Code"')[0]).toMatchObject({
      label: 'Outil : Claude Code',
      recognized: true,
    });
    expect(chips('outil:claude_code')[0]).toMatchObject({ label: 'Outil : Claude Code' });
  });
});

describe('buildMenus', () => {
  const menu = (q: string, name: string) => buildMenus(q).find((m) => m.name === name);

  it('propose les outils, les types et les périodes', () => {
    expect(buildMenus('x').map((m) => m.name)).toEqual(['outil', 'type', 'periode']);
  });

  it('écrit le filtre en tête de la requête, sans perdre le reste', () => {
    const github = menu('budget', 'outil')?.options.find((o) => o.label === 'GitHub');

    expect(github).toEqual({
      label: 'GitHub',
      active: false,
      href: '/?q=outil%3Agithub+budget',
    });
  });

  it('coche ce qui est dans la requête, et propose de le retirer', () => {
    const github = menu('outil:github budget', 'outil')?.options.find((o) => o.label === 'GitHub');

    expect(github).toMatchObject({ active: true, href: '/?q=budget' });
  });

  it('remplace la période au lieu d’en ajouter une', () => {
    const month = menu('depuis:7j x', 'periode')?.options.find(
      (o) => o.label === '30 derniers jours',
    );

    expect(month).toMatchObject({ active: false, href: '/?q=depuis%3A30j+x' });
  });
});

// Les menus, les exemples et l'aide de la page d'accueil écrivent des filtres (`outil:github`, `type:ticket`,
// `depuis:3m`) que `parseQuery` relit. Une collision de libellés, un renommage ou un nouvel outil qui casserait
// cette relecture ferait écrire une puce « non reconnu » ou un filtre ignoré, sans aucune erreur : ces tests
// parcourent tout ce que la page propose et vérifient que la recherche le comprend.

// La requête qu'une adresse de menu ou d'exemple envoie à la recherche.
const queryOf = (href: string) =>
  fromSearchParams(new URL(href, 'http://leon.test').searchParams).q;

describe('les entrées des menus de filtre', () => {
  it('écrivent chacune un seul filtre, que la recherche reconnaît', () => {
    const options = buildMenus('').flatMap((menu) => menu.options.map((o) => ({ menu, o })));

    expect(options.length).toBeGreaterThan(TOOL_KINDS.length + ITEM_NATURES.length);
    for (const { menu, o } of options) {
      const where = `${menu.name} · ${o.label}`;
      const q = queryOf(o.href);
      const parsed = parseQuery(q, NOW).filters;

      expect(
        buildActiveChips(q, NOW).map((c) => c.recognized),
        where,
      ).toEqual([true]);
      // Une seule valeur, rangée là où le menu l'annonce.
      const expected = ({ outil: 'tools', type: 'natures', periode: 'since' } as const)[menu.name];
      const found = (['tools', 'natures', 'since'] as const).filter(
        (key) => parsed[key] !== undefined,
      );
      expect(found, where).toEqual([expected]);
      const value = parsed[expected];
      expect(value instanceof Date ? 1 : value?.length, where).toBe(1);
    }
  });

  it('proposent chaque outil et chaque type du code, avec leur propre identifiant', () => {
    const [outils, types] = buildMenus('');

    // Les outils seulement : le fil de travail n'est l'outil de personne (T39), il a sa nature dans `type`.
    for (const kind of TOOL_KINDS) {
      expect(parseQuery(`outil:${kind}`, NOW).filters.tools, kind).toEqual([kind]);
    }
    for (const nature of ITEM_NATURES) {
      expect(parseQuery(`type:${nature}`, NOW).filters.natures, nature).toEqual([nature]);
    }
    expect(outils?.options).toHaveLength(TOOL_KINDS.length);
    // Le fil de travail est accepté par le filtre, pas proposé : la recherche ne le rend jamais (D35).
    expect(types?.options).toHaveLength(OFFERED_NATURES.length);
    expect(types?.options.map((option) => option.label)).not.toContain('Fil de travail');
  });

  it('ne donnent jamais deux fois le même libellé dans un menu', () => {
    for (const menu of buildMenus('')) {
      const labels = menu.options.map((o) => o.label);

      expect(new Set(labels).size, menu.name).toBe(labels.length);
    }
  });
});

describe('les exemples et l’aide de la page d’accueil', () => {
  it('proposent des recherches dont chaque filtre est reconnu', () => {
    expect(EXAMPLES.length).toBeGreaterThan(0);
    for (const example of EXAMPLES) {
      const recognized = buildActiveChips(example.q, NOW).map((chip) => chip.recognized);

      expect(recognized.every(Boolean), example.q).toBe(true);
      expect(example.hint, example.q).toMatch(/\S/);
    }
  });

  it('montrent au moins un filtre dans les exemples, pour que la syntaxe se devine', () => {
    expect(EXAMPLES.some((example) => buildActiveChips(example.q, NOW).length > 0)).toBe(true);
  });

  it('écrivent une syntaxe que la recherche comprend', () => {
    for (const item of SYNTAX) {
      const chips = buildActiveChips(item.code, NOW);

      expect(
        chips.every((chip) => chip.recognized),
        item.code,
      ).toBe(true);
      expect(item.text, item.code).toMatch(/\S/);
    }
    // Les cinq filtres de la barre sont tous expliqués (la phrase exacte n'en est pas un).
    const filters = SYNTAX.filter((item) => buildActiveChips(item.code, NOW).length === 1);
    expect(filters).toHaveLength(FILTER_KEYS.length);
  });
});

describe('les filtres en anglais', () => {
  const labels = (q: string) =>
    buildActiveChips(q, NOW, 'en').map((chip) => [chip.label, chip.recognized]);

  it('nomment les puces en anglais, filtres français compris', () => {
    expect(labels('from:julie tool:github type:meeting since:7d before:2026-10-01')).toEqual([
      ['Person: julie', true],
      ['Tool: GitHub', true],
      ['Type: Meeting', true],
      ['Since: 7 days', true],
      ['Before: Oct 1, 2026', true],
    ]);
    expect(labels('type:réunion depuis:2s since:3mo')).toEqual([
      ['Type: Meeting', true],
      ['Since: 2 weeks', true],
      ['Since: 3 months', true],
    ]);
  });

  it('écrivent des menus anglais, dont chaque entrée est un seul filtre reconnu', () => {
    const menus = buildMenus('', 'en');
    expect(menus.map((m) => [m.name, m.label])).toEqual([
      ['outil', 'Tool'],
      ['type', 'Type'],
      ['periode', 'Date'],
    ]);
    const [tools, types, periods] = menus;
    expect(tools?.options.find((o) => o.label === 'GitHub')?.href).toBe('/?q=tool%3Agithub');
    expect(types?.options.find((o) => o.label === 'Meeting')?.href).toBe('/?q=type%3Ameeting');
    expect(periods?.options.map((o) => o.label)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 3 months',
      'Last 12 months',
    ]);
    for (const menu of menus) {
      for (const o of menu.options) {
        const q = queryOf(o.href);
        expect(
          buildActiveChips(q, NOW, 'en').map((c) => c.recognized),
          `${menu.name} · ${o.label}`,
        ).toEqual([true]);
      }
    }
  });

  it('cochent un filtre écrit en français, et remplacent sa période', () => {
    const [tools, , periods] = buildMenus('outil:github depuis:7j x', 'en');

    expect(tools?.options.find((o) => o.label === 'GitHub')).toMatchObject({
      active: true,
      href: '/?q=depuis%3A7j+x',
    });
    expect(periods?.options.find((o) => o.label === 'Last 30 days')).toMatchObject({
      active: false,
      href: '/?q=since%3A30d+outil%3Agithub+x',
    });
  });

  it('proposent des exemples et une aide que la recherche comprend', () => {
    expect(EXAMPLES_EN).toHaveLength(EXAMPLES.length);
    for (const example of EXAMPLES_EN) {
      expect(
        buildActiveChips(example.q, NOW, 'en').every((chip) => chip.recognized),
        example.q,
      ).toBe(true);
    }
    for (const item of SYNTAX_EN) {
      expect(
        buildActiveChips(item.code, NOW, 'en').every((chip) => chip.recognized),
        item.code,
      ).toBe(true);
    }
    const filters = SYNTAX_EN.filter((item) => buildActiveChips(item.code, NOW).length === 1);
    expect(filters).toHaveLength(FILTER_KEYS.length);
  });
});
