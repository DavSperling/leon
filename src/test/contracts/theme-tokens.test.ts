import { describe, expect, it } from 'vitest';
import { THEME_CLASS } from '@/lib/theme-cookie';
import { readText } from './files';

const CSS = readText('src/app/globals.css');
const DARK = THEME_CLASS.sombre;
const SYSTEM = THEME_CLASS.systeme;

// Les déclarations `--jeton: valeur;` du bloc que ouvre le sélecteur (au début d'une ligne).
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.:]/g, '\\$&');
  const block = new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]?.trim()]),
  );
}

const light = tokens(':root');
const dark = tokens(`.${DARK}`);
const system = tokens(`.${SYSTEM}`);

describe('jetons des thèmes (globals.css)', () => {
  it('lit les trois blocs', () => {
    expect(Object.keys(light).length).toBeGreaterThan(30);
    expect(Object.keys(dark).length).toBeGreaterThan(30);
    expect(Object.keys(system).length).toBeGreaterThan(30);
  });

  it('redéfinit en sombre chaque jeton du thème clair, sauf le rayon des coins', () => {
    const missing = Object.keys(light).filter((name) => name !== '--radius' && !(name in dark));
    expect(missing).toEqual([]);
  });

  it('donne au thème système les valeurs du thème sombre', () => {
    expect(system).toEqual(dark);
  });

  it('ne pose le thème système que si le système est en sombre', () => {
    expect(CSS).toMatch(
      new RegExp(`@media \\(prefers-color-scheme: dark\\)\\s*\\{\\s*\\.${SYSTEM}\\s*\\{`),
    );
  });

  it('étend la variante dark: au thème sombre et au thème système', () => {
    const variant = /@custom-variant dark \{[\s\S]*?\n\}\n/.exec(CSS)?.[0] ?? '';
    expect(variant).toContain(`&:is(.${DARK} *)`);
    expect(variant).toMatch(
      new RegExp(`@media \\(prefers-color-scheme: dark\\)\\s*\\{\\s*&:is\\(\\.${SYSTEM} \\*\\)`),
    );
  });

  it('déclare dans :root chaque jeton que @theme inline lit par var()', () => {
    const theme = /@theme inline \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
    const read = [...theme.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] as string);
    // Les polices viennent de next/font ou de @theme lui-même.
    const missing = read.filter((name) => !name.startsWith('--font-') && !(name in light));
    expect(read.length).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });
});
