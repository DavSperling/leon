import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, ACTION_KINDS } from '@/lib/actions';
import type { GithubClient } from '@/server/connectors/github/client';
import { askedOf, invalidParam, SPECS, validParams } from './github-actions';

// Les règles par clé des paramètres d'une action, revérifiées à la proposition et à l'exécution : une clé inconnue,
// manquante ou hors règle fait refuser l'action. Table par clé, éprouvée sur chaque type d'action qui la porte.

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const GOOD: Record<string, string> = {
  repo: 'acme/leon',
  branch: 'feature/x',
  from: 'main',
  head: 'feature/x',
  base: 'main',
  path: 'docs/a.md',
  number: '7',
  run: '55',
  sha: SHA,
  state: 'open',
  method: 'squash',
  event: 'APPROVE',
  failed: 'oui',
  draft: 'non',
  reviewers: 'bob,carol-2',
  assignees: 'bob',
  labels: 'bug,p1',
  title: 'Un titre',
  name: 'CI',
  current: 'Ancien titre',
  message: 'Doc',
  body: '',
  content: '',
  diff: '+ x',
  lines: '12',
  asked: 'Peux-tu fusionner la PR 7 ?',
  default: 'oui',
};
const BAD: Record<string, string[]> = {
  repo: ['acme', 'a/b/c', 'acme/leon?x', ''],
  branch: ['../x', 'a b', '', '/a'],
  from: ['a..b'],
  head: ['x y'],
  base: ['-x'],
  path: ['../x', '/a', 'a//b', 'a/./b', '', 'src/a‮b.ts'],
  number: ['abc', '1234567890123', '-1', '', '1.5'],
  run: ['x', ''],
  sha: ['abc', 'g'.repeat(40), '', SHA.toUpperCase()],
  state: ['merged', 'OPEN', ''],
  method: ['octopus', ''],
  event: ['DISMISS', 'approve', ''],
  failed: ['yes', ''],
  draft: ['true', ''],
  reviewers: ['bob, carol', 'bo b', '-bob', 'a,,b', Array(16).fill('bob').join(',')],
  assignees: ['bob;carol', Array(11).fill('bob').join(',')],
  labels: ['a,,b', 'x'.repeat(51), 'a\nb', Array(21).fill('l').join(','), 'bug,a⁧b'],
  title: ['', 'a\nb', 'x'.repeat(257), 'a\u202Eb'],
  name: ['', 'a\r\nb', 'a\u2067b'],
  current: ['', 'x'.repeat(257), 'a\u202Ab'],
  message: ['', 'x'.repeat(2001), 'a\u202Eb'],
  body: ['x'.repeat(65_537), 'a\u2066b'],
  content: ['x'.repeat(200_001), 'a\u202Cb'],
  diff: ['x'.repeat(200_001), '- a‮b'],
  lines: ['-1', '1.5', 'abc', ''],
  asked: [
    '',
    'x'.repeat(301),
    'a\nb',
    'a\tb',
    'a\0b',
    'a\u2028b',
    'a\u202Eb',
    'a\u2069b',
    'a\ud83db',
  ],
  default: ['yes', 'true', 'Oui', ''],
};

describe('validParams', () => {
  const keysOf = (kind: (typeof ACTION_KINDS)[number]) => [
    ...ACTION_KEYS[kind].required,
    ...ACTION_KEYS[kind].optional,
  ];
  const base = (kind: (typeof ACTION_KINDS)[number]) =>
    Object.fromEntries(keysOf(kind).map((key) => [key, GOOD[key] as string]));

  it('a une règle, une valeur bonne et des valeurs mauvaises pour chaque clé de chaque action', () => {
    for (const kind of ACTION_KINDS) {
      expect(validParams(kind, base(kind)), kind).toBe(true);
      for (const key of keysOf(kind)) {
        expect(BAD[key]?.length, `${kind} ${key}`).toBeGreaterThan(0);
        for (const value of BAD[key] as string[]) {
          expect(
            invalidParam(kind, { ...base(kind), [key]: value }),
            `${kind} ${key} ${value}`,
          ).toBe(key);
        }
        // Une valeur qui n'est pas du texte.
        expect(invalidParam(kind, { ...base(kind), [key]: 7 }), `${kind} ${key} 7`).toBe(key);
      }
    }
  });

  it('refuse une clé manquante, inconnue ou héritée, et ce qui n’est pas un objet', () => {
    const branch = base('github.creer_branche');

    expect(invalidParam('github.creer_branche', { ...branch, sha: undefined })).toBe('sha');
    const { sha: _sha, ...withoutSha } = branch;
    expect(invalidParam('github.creer_branche', withoutSha)).toBe('sha');
    expect(invalidParam('github.creer_branche', { ...branch, extra: 'x' })).toBe('extra');
    expect(invalidParam('github.creer_branche', { ...branch, path: 'a.md' })).toBe('path');
    expect(invalidParam('github.creer_branche', Object.create(branch))).toBe('repo');
    for (const value of [null, 'texte', 7, [], undefined]) {
      expect(validParams('github.creer_branche', value)).toBe(false);
    }
  });

  it('laisse la clé facultative du fichier écrit absente (fichier nouveau)', () => {
    const { sha: _sha, ...nouveau } = base('github.ecrire_fichier');

    expect(validParams('github.ecrire_fichier', nouveau)).toBe(true);
  });

  it('laisse « asked » facultative partout, et « default » aux seules écritures de fichier', () => {
    for (const kind of ACTION_KINDS) {
      const { asked: _asked, default: _default, ...params } = base(kind);

      expect(validParams(kind, params), kind).toBe(true);
      expect(ACTION_KEYS[kind].optional, kind).toContain('asked');
    }
    const fichier = base('github.supprimer_fichier');
    expect(validParams('github.supprimer_fichier', fichier)).toBe(true);
    expect(invalidParam('github.commenter', { ...base('github.commenter'), default: 'oui' })).toBe(
      'default',
    );
  });

  it('exige la branche visée d’une fusion', () => {
    const { base: _base, ...sansBase } = base('github.fusionner_pr');

    expect(ACTION_KEYS['github.fusionner_pr'].required).toContain('base');
    expect(invalidParam('github.fusionner_pr', sansBase)).toBe('base');
    expect(invalidParam('github.fusionner_pr', { ...sansBase, base: '-x' })).toBe('base');
  });

  it('refuse les caractères qui changent le sens de lecture dans les textes montrés', () => {
    const bidi = [...'\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069'];
    const shown = [
      ['github.ecrire_fichier', 'content'],
      ['github.ecrire_fichier', 'message'],
      ['github.ecrire_fichier', 'path'],
      ['github.ecrire_fichier', 'diff'],
      ['github.creer_ticket', 'labels'],
      ['github.ouvrir_pr', 'body'],
      ['github.ouvrir_pr', 'title'],
      ['github.commenter', 'body'],
    ] as const;

    for (const [kind, key] of shown) {
      for (const char of bidi) {
        expect(invalidParam(kind, { ...base(kind), [key]: `a${char}b` }), `${kind} ${key}`).toBe(
          key,
        );
      }
      // Un texte arabe, sans caractère de contrôle, passe.
      expect(validParams(kind, { ...base(kind), [key]: 'مرحبا' }), `${kind} ${key}`).toBe(true);
    }
  });

  it('refuse les caractères invisibles (largeur nulle, étiquettes), et garde les emojis composés', () => {
    for (const text of ['a\u200Bb', 'a\uFEFFb', 'a\u061Cb', 'a\u{E0041}b']) {
      expect(invalidParam('github.ouvrir_pr', { ...base('github.ouvrir_pr'), title: text })).toBe(
        'title',
      );
      expect(invalidParam('github.commenter', { ...GOOD_COMMENT, body: text })).toBe('body');
    }
    expect(validParams('github.commenter', { ...GOOD_COMMENT, body: '👩\u200D💻' })).toBe(true);
    expect(askedOf('a\u200Bb\u{E0041}c')).toBe('a b c');
  });
});

const GOOD_COMMENT = { repo: 'acme/leon', number: '7', title: 'Un titre', body: 'Texte' };

describe('askedOf', () => {
  it('rend la demande sur une ligne de 300 caractères au plus, sans contrôle ni sens de lecture', () => {
    expect(askedOf('  Fusionne\nla   PR\t7 \u202Eici\u2028 ')).toBe('Fusionne la PR 7 ici');
    expect(askedOf(undefined)).toBe('');
    expect(askedOf(' \n\t ')).toBe('');
    const long = askedOf('mot '.repeat(200));
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.startsWith('mot mot')).toBe(true);
  });

  it('ne coupe pas une paire de substitution, et écarte une moitié seule', () => {
    const cut = askedOf(`${'a'.repeat(299)}😀 suite`);

    expect(cut).toBe('a'.repeat(299));
    expect(askedOf('x\ud83dy')).toBe('x y');
    expect(askedOf('😀'.repeat(200))).toBe('😀'.repeat(150));
  });

  it('rend toujours une valeur que la règle de la clé accepte', () => {
    for (const text of [
      'Salut',
      'é'.repeat(900),
      '😀'.repeat(900),
      'a\0b\u202Ec',
      'ligne\r\nsuite',
    ]) {
      const asked = askedOf(text);

      expect(
        validParams('github.commenter', { ...GOOD_COMMENT, asked }),
        JSON.stringify(text),
      ).toBe(true);
    }
  });
});

describe('SPECS', () => {
  it('a un outil par action, propre à GitHub, et aucun qui supprime ou lance autre chose que ce qui est permis', () => {
    expect(Object.keys(SPECS).sort()).toEqual([...ACTION_KINDS].sort());
    const tools = Object.values(SPECS).map((spec) => spec.tool);

    expect(new Set(tools).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool).toMatch(/^[a-z_]+_github$/);
      expect(tool).not.toMatch(
        /release|artefact|artifact|cache|workflow|(^|_)(activer|desactiver|lancer)/,
      );
    }
  });

  it('dit dans chaque description que l’outil ne fait rien sans le clic', () => {
    for (const spec of Object.values(SPECS)) expect(spec.description.length).toBeGreaterThan(30);
  });
});

describe('fusionner_pr', () => {
  const merge = SPECS['github.fusionner_pr'];
  const PULL = {
    title: 'Titre',
    state: 'open',
    merged: false,
    draft: false,
    head: { ref: 'feature/x', sha: SHA },
    base: { ref: 'main' },
  };
  const github = (mergeable_state: string) =>
    ({
      pull: async () => ({ ...PULL, mergeable_state }),
      mergePull: async () => {
        throw new Error('fusionnée');
      },
    }) as unknown as GithubClient;
  const params = {
    repo: 'acme/leon',
    number: '7',
    title: 'Titre',
    base: 'main',
    method: 'merge',
    sha: SHA,
  };

  it.each(['blocked', 'unstable', 'behind', 'dirty'])(
    'ne propose ni ne fusionne une PR « %s »',
    async (state) => {
      expect(
        await merge.prepare(github(state), 'acme/leon', { depot: 'acme/leon', numero: 7 }),
      ).toContain('ne se fusionne pas');
      await expect(merge.execute(github(state), params as never)).rejects.toMatchObject({
        code: 'conflit',
      });
    },
  );

  it('propose une PR « clean », « has_hooks » ou « unknown »', async () => {
    for (const state of ['clean', 'has_hooks', 'unknown']) {
      expect(
        await merge.prepare(github(state), 'acme/leon', { depot: 'acme/leon', numero: 7 }),
      ).toMatchObject({ sha: SHA });
    }
  });
});
