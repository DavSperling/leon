import { describe, expect, it } from 'vitest';
import { nextAfterTools } from '@/components/verre/onboarding/tools-model';
import { OAUTH_RETURN_PATHS } from '@/lib/connection-form';
import { listFiles, productionSources, readText } from './files';

// Chemin d'URL d'un page.tsx : sans « src/app », sans groupe de routes (x), sans « page.tsx ».
const routeOf = (file: string): string =>
  `/${file
    .replace(/^src\/app\//, '')
    .split('/')
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .join('/')}`;

const ROUTES = listFiles('src/app/**/page.tsx').map(routeOf);

// Un segment dynamique [x] de la route accepte n'importe quel segment du lien.
function matchesRoute(path: string): boolean {
  const segments = path.split('/');
  return ROUTES.some((route) => {
    const routeSegments = route.split('/');
    return (
      routeSegments.length === segments.length &&
      routeSegments.every((segment, i) => /^\[.+\]$/.test(segment) || segment === segments[i])
    );
  });
}

// Chaînes qui commencent par « / » : '…', "…" et `…` (avec ses ${…}, qui peuvent contenir des guillemets),
// quand elles suivent href=, href:, redirect(, revalidatePath(, router.push( ou go( : les src="/logo.svg" ne sont pas des liens.
const PATH_LITERAL =
  /(?:href\s*[=:]\s*\{?|redirect\(|revalidatePath\(|push\(|go\()\s*(?:'(\/[^'\n]*)'|"(\/[^"\n]*)"|`(\/(?:[^`$]|\$\{[^}]*\})*)`)/g;

// Sans requête ni ancre, ${…} (suite de ${…} comprise) remplacé par [id].
const normalize = (literal: string): string =>
  literal
    .replace(/(?:\$\{[^}]*\})+/g, '[id]')
    .replace(/[?#].*$/, '')
    .replace(/(.)\/$/, '$1');

// Tous les chemins écrits dans les pages, les composants et la session (liens, redirections).
function writtenPaths(): Array<{ file: string; path: string }> {
  return productionSources(
    'src/app/**/*.{ts,tsx}',
    'src/components/**/*.tsx',
    'src/server/auth/*.ts',
  )
    .filter(({ path }) => !path.startsWith('src/app/api/'))
    .flatMap(({ path, text }) =>
      [...text.matchAll(PATH_LITERAL)].map((match) => ({
        file: path,
        path: normalize(match[1] ?? match[2] ?? (match[3] as string)),
      })),
    );
}

describe('liens entre pages', () => {
  it('connaît les routes de l’application', () => {
    expect(ROUTES).toEqual(
      expect.arrayContaining(['/', '/discussions', '/connexions', '/reglages']),
    );
  });

  it('ne garde aucune page retirée : fiches, à vérifier, journal, sources', () => {
    for (const removed of ['/fiches/[id]', '/a-verifier', '/journal', '/sources']) {
      expect(ROUTES).not.toContain(removed);
    }
  });

  it('trouve les liens écrits dans le code', () => {
    expect(writtenPaths().length).toBeGreaterThan(15);
  });

  it('mène chaque lien écrit dans le code à une page', () => {
    const broken = writtenPaths().filter(({ path }) => !matchesRoute(path));
    expect(broken).toEqual([]);
  });

  // La requête (`?supprime=…`) n'entre pas dans les liens ci-dessus : une valeur que la page de connexion ne lit pas
  // renverrait la personne sans le message qui lui dit que sa suppression est faite.
  it('lit sur la page de connexion chaque ?supprime= écrit par les actions de suppression', () => {
    const written = new Set(
      [...readText('src/app/(app)/reglages/actions.ts').matchAll(/\?supprime=([a-z]+)/g)].map(
        (match) => match[1],
      ),
    );
    const page = readText('src/app/(auth)/connexion/page.tsx');

    expect([...written].toSorted()).toEqual(['compte', 'organisation']);
    for (const value of written) expect(page).toContain(`'${value}'`);
  });

  // ONBOARDING_PATH passe par une constante : le balayage des redirect('…') ne le voit pas.
  it('mène ONBOARDING_PATH à une page', () => {
    const path = /ONBOARDING_PATH\s*=\s*'(\/[^']*)'/.exec(
      readText('src/server/auth/session.ts'),
    )?.[1];
    expect(path).toBeDefined();
    expect(matchesRoute(path as string)).toBe(true);
  });

  // La CLI bâtit les adresses de la page d'autorisation et de la page « connecté » sur l'adresse du serveur
  // (`${origin}/…`) : le balayage des pages ci-dessus ne lit pas src/cli.
  it('mène chaque page de Leon que la CLI ouvre à une page', () => {
    const paths = productionSources('src/cli/*.ts').flatMap(({ path, text }) =>
      [...text.matchAll(/\$\{origin\}(\/[a-z/-]+)/g)].map((match) => ({
        file: path,
        path: match[1],
      })),
    );
    expect(paths.map(({ path }) => path).toSorted()).toEqual(
      expect.arrayContaining(['/ordinateur/autoriser', '/ordinateur/connecte']),
    );
    expect(paths.filter(({ path }) => !matchesRoute(path as string))).toEqual([]);
  });

  // Ces adresses passent par une constante ou une fonction : le balayage des href= et redirect(' ci-dessus ne les voit pas.
  it('mène chaque retour OAuth et chaque suite de Vos outils à une page', () => {
    for (const path of [...OAUTH_RETURN_PATHS, nextAfterTools(true), nextAfterTools(false)]) {
      expect(matchesRoute(path), path).toBe(true);
    }
  });
});
