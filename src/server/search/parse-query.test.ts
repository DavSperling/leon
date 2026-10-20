import { describe, expect, it } from 'vitest';
import { ITEM_NATURES, SOURCE_KINDS } from '@/capture/turn';
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@/lib/highlight';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';
import { parseQuery } from './parse-query';

const NOW = new Date('2026-10-19T10:00:00Z');
const parse = (raw: string) => parseQuery(raw, NOW);

describe('parseQuery : les filtres', () => {
  it('sépare le texte, la personne et la date', () => {
    expect(parse('call ACME de:julie depuis:7j')).toEqual({
      text: 'call ACME',
      people: ['julie'],
      filters: { since: new Date('2026-10-12T10:00:00Z') },
    });
  });

  it('reconnaît l’outil par son identifiant ou son libellé, et le type sans accent ni casse', () => {
    expect(parse('outil:Fathom type:réunion budget')).toEqual({
      text: 'budget',
      people: [],
      filters: { tools: ['fathom'], natures: ['reunion'] },
    });
    expect(parse('outil:github').filters.tools).toEqual(['github']);
    expect(parse('outil:GitHub').filters.tools).toEqual(['github']);
    expect(parse('outil:claude_code').filters.tools).toEqual(['claude_code']);
    expect(parse('outil:"Claude Code"').filters.tools).toEqual(['claude_code']);
    expect(parse('outil:"help scout"').filters.tools).toEqual(['helpscout']);
    expect(parse('outil:tl;dv').filters.tools).toEqual(['tldv']);
    expect(parse('type:Tickets').filters.natures).toEqual(['ticket']);
    expect(parse('type:conversation').filters.natures).toEqual(['conversation']);
  });

  it('accepte les bornes en date exacte, en UTC', () => {
    expect(parse('avant:2026-10-01 depuis:2026-09-01 x')).toEqual({
      text: 'x',
      people: [],
      filters: {
        since: new Date('2026-09-01T00:00:00.000Z'),
        until: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  });

  it('compte les durées en jours, en semaines et en mois', () => {
    expect(parse('depuis:1j').filters.since).toEqual(new Date('2026-10-18T10:00:00Z'));
    expect(parse('depuis:2s').filters.since).toEqual(new Date('2026-10-05T10:00:00Z'));
    expect(parse('depuis:3m').filters.since).toEqual(new Date('2026-07-19T10:00:00Z'));
    // Un mois de moins un 31 : le dernier jour du mois d'arrivée, pas le début du suivant.
    expect(parseQuery('depuis:1m', new Date('2026-10-31T10:00:00Z')).filters.since).toEqual(
      new Date('2026-09-30T10:00:00Z'),
    );
    expect(parseQuery('depuis:12m', new Date('2028-02-29T08:00:00Z')).filters.since).toEqual(
      new Date('2027-02-28T08:00:00Z'),
    );
  });

  it('additionne les valeurs répétées', () => {
    const parsed = parse(
      'de:julie de:"Bob Martin" outil:github outil:notion type:ticket type:page x',
    );
    expect(parsed.people).toEqual(['julie', 'Bob Martin']);
    expect(parsed.filters.tools).toEqual(['github', 'notion']);
    expect(parsed.filters.natures).toEqual(['ticket', 'page']);
    expect(parsed.text).toBe('x');
    expect(parse('de:julie de:julie').people).toEqual(['julie']);
  });

  it('ignore un filtre vide, inconnu ou mal formé, et le retire du texte', () => {
    expect(parse('de:')).toEqual({ text: '', people: [], filters: {} });
    expect(parse('outil:inconnu x')).toEqual({ text: 'x', people: [], filters: {} });
    expect(parse('type:blabla x').filters).toEqual({});
    expect(parse('depuis:abc x')).toEqual({ text: 'x', people: [], filters: {} });
    expect(parse('depuis:0j x').filters).toEqual({});
    expect(parse('depuis:2026-13-45 avant:2026-02-30 x')).toEqual({
      text: 'x',
      people: [],
      filters: {},
    });
    // avant: n'accepte qu'une date.
    expect(parse('avant:7j x').filters).toEqual({});
    // Une valeur séparée de sa clé par une espace n'est pas la valeur du filtre.
    expect(parse('de: julie')).toEqual({ text: 'julie', people: [], filters: {} });
  });

  it('ne lit comme filtre que les cinq clés, sans casse, en début de mot', () => {
    expect(parse('DE:Julie Outil:GitHub').people).toEqual(['Julie']);
    expect(parse('lien http://exemple.fr/a:b').text).toBe('lien http://exemple.fr/a:b');
    expect(parse('xde:julie').people).toEqual([]);
    expect(parse('xde:julie').text).toBe('xde:julie');
  });

  it('garde une phrase exacte telle quelle, filtres compris', () => {
    expect(parse('"contrat OVH" de:julie').text).toBe('"contrat OVH"');
    expect(parse('"de:julie budget" x')).toEqual({
      text: '"de:julie budget" x',
      people: [],
      filters: {},
    });
  });
});

describe('parseQuery : les entrées bizarres', () => {
  it.each([
    [''],
    ['a'],
    ['ab'],
    ['"acme'],
    ['acme"'],
    ['"'],
    ['""'],
    ['de:'],
    ['de:""'],
    ['outil:inconnu x'],
    ['   \t\n  '],
    ['&|!():*<>'],
    [`${HIGHLIGHT_START}${HIGHLIGHT_END}`],
    ['x'.repeat(2000)],
    [`${'mot '.repeat(500)}de:julie`],
  ])('ne lève aucune exception pour %j', (raw) => {
    const parsed = parse(raw);
    expect(parsed.text.length).toBeLessThanOrEqual(300);
    expect(parsed.text.split('"').length % 2).toBe(1); // un nombre pair de guillemets
  });

  it('tronque le texte à 300 caractères, sans couper un émoji en deux', () => {
    expect(parse('x'.repeat(2000)).text).toHaveLength(300);
    const emojis = parse('😀'.repeat(400)).text;
    expect(emojis.length).toBeLessThanOrEqual(300);
    expect(emojis.length % 2).toBe(0);
    expect(emojis).toBe('😀'.repeat(emojis.length / 2));
  });

  it('retire les marqueurs de surlignage et les caractères de contrôle', () => {
    const parsed = parse(
      `ac${HIGHLIGHT_START}me${HIGHLIGHT_END} de${HIGHLIGHT_START}:julie bu\u0000dget`,
    );
    expect(parsed.text).not.toContain(HIGHLIGHT_START);
    expect(parsed.text).not.toContain(HIGHLIGHT_END);
    expect(parsed.text).not.toContain('\u0000');
    expect(parsed.text).toBe('acme bu dget');
    expect(parsed.people).toEqual(['julie']);
  });

  it('rend un guillemet non fermé inoffensif : il disparaît du texte', () => {
    expect(parse('"acme').text).toBe('acme');
    expect(parse('acme "budget').text).toBe('acme budget');
    expect(parse('"acme budget" "x').text).toBe('"acme budget" x');
  });

  it('borne le nombre de valeurs d’un filtre', () => {
    const many = Array.from({ length: 50 }, (_, i) => `de:p${i}`).join(' ');
    expect(parse(many).people.length).toBeLessThanOrEqual(10);
  });

  it('replie les espaces du texte', () => {
    expect(parse('  call \t  ACME \n budget ').text).toBe('call ACME budget');
  });
});

// Les noms d'outils et de types se comparent sans casse, accents ni ponctuation : deux outils dont le nom aplati
// serait le même (un outil ajouté au catalogue) se confondraient, et `outil:x` filtrerait le mauvais. Le
// parcours de tout le catalogue le garde.
describe('parseQuery : le catalogue des outils et des types', () => {
  it.each(SOURCE_KINDS.map((kind) => [kind]))(
    'outil:%s se retrouve par son identifiant comme par son libellé, et par eux seuls',
    (kind) => {
      const label = SOURCE_KIND_LABELS[kind];
      expect(parse(`outil:${kind}`).filters.tools, `identifiant ${kind}`).toEqual([kind]);
      expect(parse(`outil:"${label}"`).filters.tools, `libellé ${label}`).toEqual([kind]);
      expect(parse(`outil:${label.toUpperCase().replaceAll(' ', '')}`).filters.tools).toEqual([
        kind,
      ]);
    },
  );

  it.each(ITEM_NATURES.map((nature) => [nature]))(
    'type:%s se retrouve au singulier comme au pluriel, et par lui seul',
    (nature) => {
      expect(parse(`type:${nature}`).filters.natures, `nature ${nature}`).toEqual([nature]);
      expect(parse(`type:${nature}s`).filters.natures, `pluriel ${nature}s`).toEqual([nature]);
    },
  );
});
