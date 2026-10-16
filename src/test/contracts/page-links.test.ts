import { describe, expect, it } from 'vitest';
import { cardUrl } from '@/server/memory/card-url';
import { taskUrl } from '@/server/tasks/task-url';
import { pageRoutes, productionSources } from './files';

const CARD_ID = '00000000-0000-4000-8000-000000000000';

const ROUTES = pageRoutes();

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
      expect.arrayContaining(['/', '/fiches/[id]', '/journal', '/a-verifier', '/taches']),
    );
  });

  it('mène le lien des résultats MCP (cardUrl) à la page d’une fiche', () => {
    const path = new URL(cardUrl(CARD_ID)).pathname.replace(CARD_ID, '[id]');
    expect(path).toBe('/fiches/[id]');
    expect(matchesRoute(path)).toBe(true);
  });

  it('mène le lien des résultats MCP (taskUrl) à la page d’une tâche', () => {
    const path = new URL(taskUrl('LEO-12')).pathname.replace('LEO-12', '[ref]');
    expect(path).toBe('/taches/[ref]');
    expect(matchesRoute(path)).toBe(true);
  });

  it('trouve les liens écrits dans le code', () => {
    expect(writtenPaths().length).toBeGreaterThan(15);
  });

  it('mène chaque lien écrit dans le code à une page', () => {
    const broken = writtenPaths().filter(({ path }) => !matchesRoute(path));
    expect(broken).toEqual([]);
  });
});
