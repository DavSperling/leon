import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, ACTION_KINDS } from '@/lib/actions';
import { invalidParam, SPECS, validParams } from './github-actions';

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
};
const BAD: Record<string, string[]> = {
  repo: ['acme', 'a/b/c', 'acme/leon?x', ''],
  branch: ['../x', 'a b', '', '/a'],
  from: ['a..b'],
  head: ['x y'],
  base: ['-x'],
  path: ['../x', '/a', 'a//b', 'a/./b', ''],
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
  labels: ['a,,b', 'x'.repeat(51), 'a\nb', Array(21).fill('l').join(',')],
  title: ['', 'a\nb', 'x'.repeat(257)],
  name: ['', 'a\r\nb'],
  current: ['', 'x'.repeat(257)],
  message: ['', 'x'.repeat(2001)],
  body: ['x'.repeat(65_537)],
  content: ['x'.repeat(200_001)],
  diff: ['x'.repeat(200_001)],
  lines: ['-1', '1.5', 'abc', ''],
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
