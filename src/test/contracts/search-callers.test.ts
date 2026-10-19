import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

// Chaque appelant de `searchPassages` passe l'`embedder` venu de `getEmbedder(env)` (C4 du plan du deuxième jet).
// En l'oubliant, la recherche reste en plein texte sans que personne le voie : aucune erreur, aucun test qui
// casse, seulement des résultats moins bons. Ce test lit les sources et refuse un appel sans `embedder`.

const SEARCH_FOLDER = 'src/server/search/';
const CALL = /\bsearchPassages\(/g;

// Le texte des arguments d'un appel : de la parenthèse ouvrante à sa fermante (les chaînes sont lues telles
// quelles, un code qui y met une parenthèse déséquilibrée n'existe pas ici).
function argumentsAt(text: string, open: number): string {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text.charAt(index);
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return text.slice(open, index + 1);
  }
  return text.slice(open);
}

type Call = { path: string; line: number; args: string };

function callers(): Call[] {
  const found: Call[] = [];
  for (const { path, text } of productionSources('src/**/*.{ts,tsx}')) {
    if (path.startsWith(SEARCH_FOLDER)) continue;
    for (const match of text.matchAll(CALL)) {
      const open = match.index + match[0].length - 1;
      found.push({
        path,
        line: text.slice(0, open).split('\n').length,
        args: argumentsAt(text, open),
      });
    }
  }
  return found;
}

describe('appelants de searchPassages', () => {
  it('en trouve au moins un : la lecture des sources fonctionne', () => {
    expect(callers().length).toBeGreaterThan(0);
  });

  it("passent tous l'embedder", () => {
    const missing = callers()
      .filter((call) => !/\bembedder\b/.test(call.args))
      .map((call) => `${call.path}:${call.line}`);

    expect(missing).toEqual([]);
  });

  it("refuse un appel sans embedder (le test ne laisse pas passer l'oubli)", () => {
    const code = 'await searchPassages(ctx, { query, filters });';
    expect(/\bembedder\b/.test(argumentsAt(code, code.indexOf('(')))).toBe(false);
    const good = 'await searchPassages(ctx, { query, embedder: deps.embedder });';
    expect(/\bembedder\b/.test(argumentsAt(good, good.indexOf('(')))).toBe(true);
  });
});
