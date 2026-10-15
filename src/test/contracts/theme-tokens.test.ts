import { describe, expect, it } from 'vitest';
import { readText } from './files';

const CSS = readText('src/app/globals.css');

// Les déclarations `--jeton: valeur;` du bloc que ouvre le sélecteur (au début d'une ligne).
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.:]/g, '\\$&');
  const block = new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]?.trim()]),
  );
}

const light = tokens(':root');
const dark = tokens('.dark');
const system = tokens('.theme-systeme');

describe('jetons des thèmes (globals.css)', () => {
  it('lit les trois blocs', () => {
    expect(Object.keys(light).length).toBeGreaterThan(30);
    expect(Object.keys(dark).length).toBeGreaterThan(30);
  });

  it('redéfinit en sombre chaque jeton du thème clair, sauf le rayon des coins', () => {
    const missing = Object.keys(light).filter((name) => name !== '--radius' && !(name in dark));
    expect(missing).toEqual([]);
  });

  it('donne au thème système les valeurs du thème sombre', () => {
    expect(system).toEqual(dark);
  });
});
