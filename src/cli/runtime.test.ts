import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import runtime from './runtime.json';

// Le Node épinglé que le script d'installation pose dans ~/.leon (S07 du plan « CLI sans clone ») : la version
// exacte et l'empreinte SHA-256 de chaque archive officielle de nodejs.org. Ces valeurs sont recopiées à la main
// de SHASUMS256.txt (voir le README) : ces tests attrapent une faute de frappe ou un oubli, pas une fausse empreinte.
const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];

describe('runtime.json', () => {
  it('épingle une version exacte de Node qui satisfait engines.node', () => {
    expect(runtime.version).toMatch(/^\d+\.\d+\.\d+$/);
    const major = Number(runtime.version.split('.')[0]);
    const minimum = Number(/\d+/.exec(pkg.engines.node)?.[0]);
    expect(major).toBeGreaterThanOrEqual(minimum);
  });

  it('porte exactement les quatre plateformes prises en charge', () => {
    expect(Object.keys(runtime.plateformes).sort()).toEqual([...PLATFORMS].sort());
  });

  it.each(PLATFORMS)(
    'l’empreinte de %s fait 64 caractères hexadécimaux en minuscules',
    (platform) => {
      const hashes: Record<string, string> = runtime.plateformes;
      expect(hashes[platform]).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('ne répète aucune empreinte d’une plateforme à l’autre', () => {
    expect(new Set(Object.values(runtime.plateformes)).size).toBe(PLATFORMS.length);
  });
});
