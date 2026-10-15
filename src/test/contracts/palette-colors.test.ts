import { describe, expect, it } from 'vitest';
import { COLOR_PALETTE } from '@/lib/tasks/palette';
import { listFiles, readText } from './files';

// color text not null check (color ~ '<motif>') : les statuts et les étiquettes.
const SQL_COLOR_CHECK = /color text not null check \(color ~ '([^']+)'\)/g;
const sqlPatterns = listFiles('src/server/db/migrations/*.sql').flatMap((path) =>
  [...readText(path).matchAll(SQL_COLOR_CHECK)].map((match) => match[1] as string),
);
// Les actions qui reçoivent une couleur : `color: z.string().regex(/…/)` ou `const Color = z.string().regex(/…/)`.
const COLOR_ACTIONS = [
  'src/app/(taches)/taches/actions.ts',
  'src/app/(taches)/taches/reglages/actions.ts',
];
const zodPattern = (path: string) =>
  /[cC]olor(?:: |\s*=\s*)z\.string\(\)\.regex\(\/(.+)\/\)/.exec(readText(path))?.[1];

describe('couleurs de la palette', () => {
  it('trouve les contraintes des statuts et des étiquettes', () => {
    expect(sqlPatterns.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sqlPatterns).size).toBe(1);
  });

  it('chacune passe la contrainte de la base', () => {
    const pattern = new RegExp(sqlPatterns[0] as string);
    expect(COLOR_PALETTE.filter((color) => !pattern.test(color))).toEqual([]);
  });

  it.each(COLOR_ACTIONS)('%s applique le même motif que la base', (path) => {
    expect(zodPattern(path)).toBe(sqlPatterns[0]);
  });
});
