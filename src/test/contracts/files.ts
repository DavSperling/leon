import { existsSync, globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GENERATED = ['node_modules/', '.output/', '.wxt/', '.next/'];

// Chemins relatifs à la racine du dépôt, triés ; les dossiers générés sont ignorés.
export function listFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: ROOT })
    .filter((path) => !GENERATED.some((dir) => path.includes(dir)))
    .sort();
}

// Chemin d'URL de chaque page.tsx : sans « src/app », sans groupe de routes (x), sans « page.tsx ».
export const pageRoutes = (): string[] =>
  listFiles('src/app/**/page.tsx').map(
    (file) =>
      `/${file
        .replace(/^src\/app\//, '')
        .split('/')
        .slice(0, -1)
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .join('/')}`,
  );

export function readText(path: string): string {
  return readFileSync(`${ROOT}${path}`, 'utf8');
}

export const pathExists = (path: string): boolean => existsSync(`${ROOT}${path}`);

const isTestFile = (path: string): boolean => /\.test\.tsx?$/.test(path);

// Sources de production (TypeScript) sous les motifs donnés, sans les fichiers de test.
export function productionSources(...patterns: string[]): Array<{ path: string; text: string }> {
  return patterns
    .flatMap(listFiles)
    .filter((path) => !isTestFile(path))
    .map((path) => ({ path, text: readText(path) }));
}
