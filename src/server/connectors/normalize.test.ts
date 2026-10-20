import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '@/capture/mask-secrets';
import {
  CONNECTOR_TURN_MAX,
  htmlToText,
  mergeSpeakerTurns,
  normalizeItem,
  splitText,
} from './normalize';
import type { ConnectorItem, ConnectorTurn } from './types';

afterEach(() => {
  vi.restoreAllMocks();
});

// Des paragraphes numérotés de 99 caractères, séparés par une ligne vide.
function paragraphs(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${i}:`.padEnd(99, 'x'));
}

describe('splitText', () => {
  it('rend un texte court tel quel', () => {
    expect(splitText('Bonjour', CONNECTOR_TURN_MAX)).toEqual(['Bonjour']);
  });

  it('coupe 10 000 caractères en paragraphes aux lignes vides', () => {
    const text = paragraphs(100).join('\n\n');

    const chunks = splitText(text, CONNECTOR_TURN_MAX);

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CONNECTOR_TURN_MAX);
      expect(chunk).toMatch(/^p\d+:/);
    }
    expect(chunks.join('\n\n')).toBe(text);
  });

  it('commence un morceau à la ligne de titre quand la coupe tombe dans sa section', () => {
    const intro = paragraphs(30).join('\n\n');
    const section = paragraphs(60).join('\n\n');
    const text = `${intro}\n\n## Titre\n\n${section}`;

    const chunks = splitText(text, CONNECTOR_TURN_MAX);

    expect(chunks[0]).toBe(intro);
    expect(chunks[1]?.startsWith('## Titre\n\n')).toBe(true);
  });

  it('coupe un bloc sans ligne vide aux fins de ligne', () => {
    const lines = paragraphs(100);
    const text = lines.join('\n');

    const chunks = splitText(text, CONNECTOR_TURN_MAX);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.endsWith('x')).toBe(true);
    expect(chunks.join('\n')).toBe(text);
  });

  it('coupe à la longueur maximale une ligne sans fin de ligne', () => {
    const chunks = splitText('a'.repeat(20_000), CONNECTOR_TURN_MAX);

    expect(chunks.map((chunk) => chunk.length)).toEqual([8000, 8000, 4000]);
  });

  it('ne rend aucun morceau vide', () => {
    expect(splitText('  \n\n \t ', CONNECTOR_TURN_MAX)).toEqual([]);
    const chunks = splitText(
      `${'a'.repeat(7990)}\n\n\n\n\n\n${'b'.repeat(100)}`,
      CONNECTOR_TURN_MAX,
    );
    expect(chunks.every((chunk) => chunk.trim() !== '')).toBe(true);
    expect(chunks).toHaveLength(2);
  });

  it('traite les fins de ligne Windows comme les autres', () => {
    expect(splitText('aa\r\n\r\nbb\r\ncc', 7)).toEqual(['aa', 'bb\ncc']);
  });
});

describe('htmlToText', () => {
  it('sépare les paragraphes par une ligne vide', () => {
    expect(htmlToText('<p>a</p><p>b</p>')).toBe('a\n\nb');
  });

  it('écrit les éléments de liste avec un tiret', () => {
    expect(htmlToText('<ul><li>x</li></ul>')).toBe('- x');
    expect(htmlToText('<ul><li>x</li><li>y</li></ul>')).toBe('- x\n- y');
    expect(htmlToText('<p>Liste</p><ol><li>un<li>deux</ol>')).toBe('Liste\n\n- un\n- deux');
  });

  it('passe à la ligne sur br et sur les blocs', () => {
    expect(htmlToText('a<br>b<br/>c')).toBe('a\nb\nc');
    expect(htmlToText('<div>a</div><div>b</div>')).toBe('a\nb');
    expect(htmlToText('<h1>Titre</h1><p>Texte</p>')).toBe('Titre\n\nTexte');
  });

  it('décode les entités', () => {
    expect(htmlToText('<p>a &amp; b &eacute; &#39;c&#39; &#x41; &nbsp;d &laquo;e&raquo;</p>')).toBe(
      "a & b é 'c' A  d «e»",
    );
  });

  it('ne décode qu’une fois et laisse ce qui n’est pas une entité', () => {
    expect(htmlToText('&amp;lt; &inconnue; &#99999999; AT&T')).toBe(
      '&lt; &inconnue; &#99999999; AT&T',
    );
  });

  it('retire script et style avec leur contenu', () => {
    const html = '<p>a</p><script>alert("x")</script><style>p{color:red}</style><p>b</p>';
    expect(htmlToText(html)).toBe('a\n\nb');
  });

  it('retire le contenu d’un script jamais fermé', () => {
    expect(htmlToText('<p>a</p><script>alert("x")')).toBe('a');
  });

  it('retire les balises, leurs attributs et les commentaires, et garde le texte', () => {
    const html =
      '<!-- note --><p class="x">Voir <a href="https://acme.test/?a=1&b=2">le site</a></p>';
    expect(htmlToText(html)).toBe('Voir le site');
  });

  it('garde un signe inférieur qui n’ouvre pas une balise', () => {
    expect(htmlToText('<p>1 < 2 et 3 > 2</p>')).toBe('1 < 2 et 3 > 2');
  });

  it('ne prend pas pour une balise un texte encodé', () => {
    expect(htmlToText('&lt;script&gt;x&lt;/script&gt;')).toBe('<script>x</script>');
  });

  it('reste rapide sur des milliers de débuts de balise sans fin', () => {
    const started = Date.now();
    const text = htmlToText(`${'<a'.repeat(200_000)} fin`);
    expect(text).toBe('');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

const turn = (name: string | null, text: string, ts: string, id = text): ConnectorTurn => ({
  externalId: id,
  role: 'participant',
  author: { name, email: name ? `${name.toLowerCase()}@acme.test` : null },
  text,
  ts,
});

describe('mergeSpeakerTurns', () => {
  it('réunit les prises de parole consécutives du même auteur', () => {
    const turns = [
      turn('Marie', 'un', '2026-10-15T10:00:00Z'),
      turn('Marie', 'deux', '2026-10-15T10:00:05Z'),
      turn('Paul', 'trois', '2026-10-15T10:00:10Z'),
      turn('Marie', 'quatre', '2026-10-15T10:00:15Z'),
    ];

    const merged = mergeSpeakerTurns(turns);

    expect(merged.map((t) => t.text)).toEqual(['un\ndeux', 'trois', 'quatre']);
    expect(merged[0]?.ts).toBe('2026-10-15T10:00:00Z');
    expect(merged[0]?.externalId).toBe('un');
    expect(merged[0]?.author.name).toBe('Marie');
  });

  it('ne modifie pas les tours reçus', () => {
    const turns = [
      turn('Marie', 'un', '2026-10-15T10:00:00Z'),
      turn('Marie', 'deux', '2026-10-15T10:00:05Z'),
    ];

    mergeSpeakerTurns(turns);

    expect(turns.map((t) => t.text)).toEqual(['un', 'deux']);
  });

  it('distingue deux auteurs sans nom par leur adresse', () => {
    const a = {
      ...turn(null, 'un', '2026-10-15T10:00:00Z'),
      author: { name: null, email: 'a@acme.test' },
    };
    const b = {
      ...turn(null, 'deux', '2026-10-15T10:00:05Z'),
      author: { name: null, email: 'b@acme.test' },
    };

    expect(mergeSpeakerTurns([a, b])).toHaveLength(2);
  });

  it('rend une liste vide pour une liste vide', () => {
    expect(mergeSpeakerTurns([])).toEqual([]);
  });
});

function item(turns: ConnectorTurn[], overrides: Partial<ConnectorItem> = {}): ConnectorItem {
  return {
    externalId: 'issue:acme/leon#12',
    nature: 'ticket',
    title: 'Choisir la base',
    url: 'https://github.com/acme/leon/issues/12',
    updatedAt: '2026-10-15T10:00:00Z',
    origin: { repo: 'acme/leon' },
    turns,
    ...overrides,
  };
}

const body = (text: string, id = 'body'): ConnectorTurn => ({
  externalId: id,
  role: 'document',
  author: { name: 'Marie Durand', email: 'marie@acme.test' },
  text,
  ts: '2026-10-15T09:00:00Z',
});

const normalize = (value: ConnectorItem) => normalizeItem(value, 'github');

describe('normalizeItem', () => {
  it('garde les champs de l’élément et convertit les tours', () => {
    const result = normalize(item([body('On prend Postgres.')]));

    expect(result).toMatchObject({
      externalId: 'issue:acme/leon#12',
      nature: 'ticket',
      title: 'Choisir la base',
      url: 'https://github.com/acme/leon/issues/12',
      updatedAt: '2026-10-15T10:00:00.000Z',
      origin: { repo: 'acme/leon' },
    });
    expect(result?.turns).toHaveLength(1);
    expect(result?.turns[0]).toMatchObject({
      role: 'document',
      authorName: 'Marie Durand',
      authorEmail: 'marie@acme.test',
      text: 'On prend Postgres.',
      ts: new Date('2026-10-15T09:00:00Z'),
    });
  });

  // Le côté et la note interne sont donnés par le connecteur, d'après l'outil : le socle les garde tels
  // quels, sur chaque morceau d'un tour coupé, et ne les déduit jamais du texte.
  it('garde le côté et la note interne du tour, sans côté ni note par défaut', () => {
    const plain = normalize(item([body('Texte')]));
    const marked = normalize(
      item([{ ...body('[Note interne] Texte'), side: 'external', internalNote: false }]),
    );
    const note = normalize(item([{ ...body('Texte'), side: 'team', internalNote: true }]));

    expect(plain?.turns[0]).toMatchObject({ authorSide: null, internalNote: false });
    expect(marked?.turns[0]).toMatchObject({ authorSide: 'external', internalNote: false });
    expect(note?.turns[0]).toMatchObject({ authorSide: 'team', internalNote: true });
  });

  it('répète le côté et la note interne sur chaque morceau d’un tour trop long', () => {
    const text = paragraphs(300).join('\n\n');

    const result = normalize(item([{ ...body(text), side: 'external', internalNote: true }]));

    expect(result?.turns.length).toBeGreaterThan(1);
    for (const piece of result?.turns ?? []) {
      expect(piece).toMatchObject({ authorSide: 'external', internalNote: true });
    }
  });

  it('suffixe chaque identifiant de tour de 12 caractères hexadécimaux, stables pour un même texte', () => {
    const first = normalize(item([body('Texte A')]));
    const again = normalize(item([body('Texte A')]));
    const edited = normalize(item([body('Texte B')]));

    expect(first?.turns[0]?.externalId).toMatch(/^body#[0-9a-f]{12}$/);
    expect(again?.turns[0]?.externalId).toBe(first?.turns[0]?.externalId);
    expect(edited?.turns[0]?.externalId).not.toBe(first?.turns[0]?.externalId);
  });

  it('coupe un tour de 50 000 caractères en morceaux numérotés de 8 000 caractères au plus', () => {
    const last = 'DERNIER paragraphe'.padEnd(99, 'z');
    const text = [...paragraphs(499), last].join('\n\n');

    const result = normalize(item([body(text)]));

    const turns = result?.turns ?? [];
    expect(turns.length).toBeGreaterThanOrEqual(7);
    turns.forEach((t, index) => {
      expect(t.externalId.startsWith(`body:${index + 1}#`)).toBe(true);
      expect(t.text.length).toBeLessThanOrEqual(8000);
      expect(t.text).not.toContain('[…tronqué]');
    });
    expect(turns.at(-1)?.text).toContain(last);
  });

  it('masque une clé privée placée à cheval sur une coupe', () => {
    const payload = Array.from({ length: 12 }, (_, i) =>
      `MIIEvQIBADANBgkqhkiG9w0BAQE${i}`.padEnd(64, 'Q'),
    );
    const key = ['-----BEGIN PRIVATE KEY-----', ...payload, '-----END PRIVATE KEY-----'].join('\n');
    const filler = `${'l'.repeat(99)}\n`.repeat(78);
    const text = `${filler}${key}\n\n${'fin '.repeat(3000)}`;

    const result = normalize(item([body(text)]));

    const all = (result?.turns ?? []).map((t) => t.text).join('\n');
    expect(all).toContain(SECRET_MASK);
    expect(all).not.toContain('PRIVATE KEY');
    for (const line of payload) expect(all).not.toContain(line);
  });

  it('plafonne un tour à 100 000 caractères et le marque', () => {
    const result = normalize(item([body(paragraphs(1200).join('\n\n'))]));

    const turns = result?.turns ?? [];
    expect(turns.at(-1)?.text.endsWith('[…tronqué]')).toBe(true);
    const total = turns.reduce((sum, t) => sum + t.text.length, 0);
    expect(total).toBeLessThanOrEqual(100_000);
    for (const t of turns) expect(t.text.length).toBeLessThanOrEqual(8000);
  });

  it('masque les secrets du texte et du titre', () => {
    const key = `sk-ant-${'a'.repeat(30)}`;

    const result = normalize(item([body(`La clé est ${key}`)], { title: `Clé ${key}` }));

    expect(result?.title).toBe(`Clé ${SECRET_MASK}`);
    expect(result?.turns[0]?.text).toBe(`La clé est ${SECRET_MASK}`);
  });

  it('coupe le titre à 300 caractères', () => {
    const result = normalize(item([body('x')], { title: 't'.repeat(400) }));

    expect(result?.title).toHaveLength(300);
  });

  it('retire les system-reminder et les tours vides, et garde les autres dans l’ordre', () => {
    const empty = { ...body('   ', 'vide') };
    const reminder = { ...body('<system-reminder>Rappel</system-reminder>', 'rappel') };
    const comment: ConnectorTurn = {
      ...body('Je suis d’accord.', 'comment:1'),
      role: 'participant',
    };

    const result = normalize(item([empty, body('Corps'), reminder, comment]));

    expect(result?.turns.map((t) => t.text)).toEqual(['Corps', 'Je suis d’accord.']);
    expect(result?.turns[1]?.externalId).toMatch(/^comment:1#/);
  });

  it('rend null quand aucun tour ne reste', () => {
    expect(normalize(item([body('  \n ')]))).toBeNull();
    expect(normalize(item([]))).toBeNull();
  });

  it('coupe nom et adresse de l’auteur à la taille de la base', () => {
    const long = {
      ...body('x'),
      author: { name: 'n'.repeat(300), email: `${'e'.repeat(400)}@acme.test` },
    };

    const result = normalize(item([long]));

    expect(result?.turns[0]?.authorName).toHaveLength(200);
    expect(result?.turns[0]?.authorEmail).toHaveLength(320);
  });

  it('refuse un identifiant de plus de 200 caractères et le journalise sans le reprendre', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const externalId = `issue:${'z'.repeat(250)}`;

    const result = normalize(item([body('x')], { externalId }));

    expect(result).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0]?.join(' ') ?? '';
    expect(line).toContain('github');
    expect(line).toContain('256');
    expect(line).not.toContain('zzzz');
  });

  it('refuse un élément sans date lisible et journalise l’outil et la raison, jamais le contenu', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(normalize(item([body('Texte confidentiel')], { updatedAt: 'demain' }))).toBeNull();
    expect(normalize(item([{ ...body('Texte confidentiel'), ts: 'hier' }]))).toBeNull();

    const lines = logged.mock.calls.map((call) => call.join(' '));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Date d’élément illisible');
    expect(lines[1]).toContain('Date de tour illisible');
    for (const line of lines) {
      expect(line).toContain('github');
      expect(line).not.toContain('confidentiel');
      expect(line).not.toContain('hier');
    }
  });

  it('garde les identifiants de tour dans la limite de 200 caractères', () => {
    const result = normalize(item([body('x', 'c'.repeat(300))]));

    expect(result?.turns[0]?.externalId.length).toBeLessThanOrEqual(200);
    expect(result?.turns[0]?.externalId).toMatch(/#[0-9a-f]{12}$/);
  });
});

// --- Dates : ISO 8601 avec fuseau explicite, jamais le fuseau du serveur.

const WITHOUT_ZONE = [
  '2019-05-29 04:21:51',
  '2026-10-15T10:00:00',
  '1567780450202',
  '1567780450',
  '10/15/2026',
  '2026-10-15',
  'demain',
  '',
];
const INSTANT = '2026-10-15T10:00:00.000Z';
const WITH_ZONE: Array<[string, string]> = [
  ['2026-10-15T10:00:00Z', INSTANT],
  ['2026-10-15T10:00:00.000Z', INSTANT],
  ['2026-10-15T10:00:00.5Z', '2026-10-15T10:00:00.500Z'],
  ['2026-10-15T12:00:00+02:00', INSTANT],
  ['2026-10-15T12:00:00+0200', INSTANT],
  ['2026-10-15T12:00+02:00', INSTANT],
  ['2026-10-15T05:00:00-05:00', INSTANT],
];

describe.each(['Pacific/Auckland', 'UTC'])(
  'normalizeItem : dates (fuseau du serveur %s)',
  (zone) => {
    const before = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    });
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('change vraiment le fuseau lu par Date (sinon le test ne prouve rien)', () => {
      const legacy = new Date('2026-10-15T10:00:00').toISOString();

      expect(legacy).toBe(zone === 'UTC' ? '2026-10-15T10:00:00.000Z' : '2026-10-14T21:00:00.000Z');
    });

    it.each(WITHOUT_ZONE)('refuse « %s » comme date d’élément', (value) => {
      expect(normalize(item([body('x')], { updatedAt: value }))).toBeNull();
    });

    it.each(WITHOUT_ZONE)('refuse « %s » comme date de tour, au lieu de la remplacer', (value) => {
      expect(normalize(item([{ ...body('x'), ts: value }]))).toBeNull();
    });

    it.each(WITH_ZONE)('accepte « %s » et rend toujours le même instant', (value, instant) => {
      const result = normalize(item([{ ...body('x'), ts: value }], { updatedAt: value }));

      expect(result?.updatedAt).toBe(instant);
      expect(result?.turns[0]?.ts.toISOString()).toBe(instant);
    });
  },
);

// --- Caractère nul : Postgres le refuse dans un text comme dans un jsonb.

describe('normalizeItem : caractère nul', () => {
  const nul = (text: string) => text.replace('|', '\u0000');

  it('le retire de tout ce qui part vers la base', () => {
    const turn: ConnectorTurn = {
      externalId: nul('comment:|1'),
      role: 'participant',
      author: { name: nul('Marie| Durand'), email: nul('marie|@acme.test') },
      text: nul('Bonjour| tout le monde'),
      ts: '2026-10-15T09:00:00Z',
    };

    const result = normalize(
      item([turn], {
        externalId: nul('issue:acme/leon#|12'),
        title: nul('Choisir| la base'),
        url: nul('https://github.com/acme/leon/issues/|12'),
        origin: { [nul('re|po')]: nul('acme/|leon') },
      }),
    );

    expect(result).toMatchObject({
      externalId: 'issue:acme/leon#12',
      title: 'Choisir la base',
      url: 'https://github.com/acme/leon/issues/12',
      origin: { repo: 'acme/leon' },
    });
    expect(result?.turns[0]).toMatchObject({
      authorName: 'Marie Durand',
      authorEmail: 'marie@acme.test',
      text: 'Bonjour tout le monde',
    });
    expect(result?.turns[0]?.externalId).toMatch(/^comment:1#[0-9a-f]{12}$/);
    expect(JSON.stringify(result)).not.toContain('\\u0000');
    expect(JSON.stringify(result)).not.toContain('\u0000');
  });

  it('calcule l’empreinte sur le texte sans caractère nul', () => {
    const clean = normalize(item([body('Bonjour')]));
    const dirty = normalize(item([body(nul('Bon|jour'))]));

    expect(dirty?.turns[0]?.externalId).toBe(clean?.turns[0]?.externalId);
  });

  it('masque un secret que le caractère nul coupait en deux', () => {
    const key = `sk-ant-${'a'.repeat(15)}|${'a'.repeat(15)}`;

    const result = normalize(item([body(nul(`La clé est ${key}`))]));

    expect(result?.turns[0]?.text).toBe(`La clé est ${SECRET_MASK}`);
  });

  it('laisse intact un élément sans caractère nul', () => {
    const result = normalize(item([body('Texte')], { url: null }));

    expect(result?.url).toBeNull();
    expect(result?.origin).toEqual({ repo: 'acme/leon' });
  });
});

// --- Paires de substitution : Postgres refuse dans un jsonb la moitié isolée d'un emoji
// (`"\ud83d"`), que JSON.stringify écrit telle quelle.

// Toutes les chaînes d'une valeur, clés d'objet comprises (les dates et les nombres sont ignorés).
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value === null || typeof value !== 'object' || value instanceof Date) return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...allStrings(inner)]);
}

describe('normalizeItem : moitié de paire de substitution', () => {
  const half = '\ud83d'; // première moitié de 😀
  const other = '\ude00'; // seconde moitié de 😀, seule
  const nul = '\u0000';

  it('ne laisse aucune chaîne mal formée ni octet nul, dans aucun champ', () => {
    const turn: ConnectorTurn = {
      externalId: `comment:${half}1`,
      role: 'participant',
      author: { name: `Marie${half} Durand`, email: `marie${other}@acme.test` },
      text: `Bonjour${half} tout${other} le${nul} monde 😀`,
      ts: '2026-10-15T09:00:00Z',
    };

    const result = normalize(
      item([turn, body(`Un autre tour${half}`, `body${other}`)], {
        externalId: `issue:${half}12`,
        title: `Choisir${half} la base${other}${nul}`,
        url: `https://github.com/acme/leon/issues/${half}12`,
        origin: { [`re${half}po`]: `acme${other}/leon`, [`pa${nul}ge`]: `Plan${half}` },
      }),
    );

    expect(result).not.toBeNull();
    const strings = allStrings(result);
    expect(strings.length).toBeGreaterThanOrEqual(20); // le parcours ne passe pas à vide
    for (const text of strings) {
      expect(text.isWellFormed(), JSON.stringify(text)).toBe(true);
      expect(text).not.toContain(nul);
    }
    expect(result?.url).toBe('https://github.com/acme/leon/issues/�12');
    expect(result?.origin).toEqual({ 're�po': 'acme�/leon', page: 'Plan�' });
    expect(result?.turns[0]?.text).toBe('Bonjour� tout� le monde 😀');
  });

  it('garde un emoji entier', () => {
    const result = normalize(
      item([body('Bravo 😀')], { title: 'Fête 😀', origin: { espace: '😀' } }),
    );

    expect(result?.title).toBe('Fête 😀');
    expect(result?.origin).toEqual({ espace: '😀' });
    expect(result?.turns[0]?.text).toBe('Bravo 😀');
  });

  it('ne coupe pas un emoji en deux en raccourcissant un titre, un nom ou un identifiant', () => {
    const turn: ConnectorTurn = {
      externalId: `${'i'.repeat(179)}😀`,
      role: 'participant',
      author: { name: `${'n'.repeat(199)}😀`, email: `${'e'.repeat(319)}😀` },
      text: 'Bonjour',
      ts: '2026-10-15T09:00:00Z',
    };

    const result = normalize(item([turn], { title: `${'t'.repeat(299)}😀` }));

    expect(result?.title).toBe('t'.repeat(299));
    expect(result?.turns[0]?.authorName).toBe('n'.repeat(199));
    expect(result?.turns[0]?.authorEmail).toBe('e'.repeat(319));
    expect(result?.turns[0]?.externalId).toMatch(/^i{179}#[0-9a-f]{12}$/);
    for (const text of allStrings(result)) expect(text.isWellFormed()).toBe(true);
  });

  it('ne coupe pas un emoji en deux en découpant ou en plafonnant un long texte', () => {
    const cutInTwo = `${'a'.repeat(CONNECTOR_TURN_MAX - 1)}😀 fin`;
    const capped = `${'b'.repeat(99_988)}😀${'c'.repeat(50)}`; // le plafond de 100 000 tombe dans l'emoji

    const split = normalize(item([body(cutInTwo)]));
    const long = normalize(item([body(capped)]));

    expect(split?.turns.map((turn) => turn.text)).toEqual([
      'a'.repeat(CONNECTOR_TURN_MAX - 1),
      '😀 fin',
    ]);
    for (const text of allStrings(split)) expect(text.isWellFormed()).toBe(true);
    for (const text of allStrings(long)) expect(text.isWellFormed()).toBe(true);
  });
});
