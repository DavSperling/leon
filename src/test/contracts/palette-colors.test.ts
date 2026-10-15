import { describe, expect, it } from 'vitest';
import { COLOR_PALETTE } from '@/lib/tasks/palette';
import { listFiles, readText } from './files';

// color text not null check (color ~ '<motif>') : les statuts et les étiquettes.
const SQL_COLOR_CHECK = /color text not null check \(color ~ '([^']+)'\)/g;
const sqlPatterns = listFiles('src/server/db/migrations/*.sql').flatMap((path) =>
  [...readText(path).matchAll(SQL_COLOR_CHECK)].map((match) => match[1] as string),
);
const zodPattern = /color: z\.string\(\)\.regex\(\/(.+)\/\)/.exec(
  readText('src/app/(taches)/taches/actions.ts'),
)?.[1];

describe('couleurs de la palette', () => {
  it('trouve les contraintes des statuts et des étiquettes', () => {
    expect(sqlPatterns.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sqlPatterns).size).toBe(1);
  });

  it('chacune passe la contrainte de la base', () => {
    const pattern = new RegExp(sqlPatterns[0] as string);
    expect(COLOR_PALETTE.filter((color) => !pattern.test(color))).toEqual([]);
  });

  it('l’action de création d’étiquette applique le même motif que la base', () => {
    expect(zodPattern).toBe(sqlPatterns[0]);
  });
});
