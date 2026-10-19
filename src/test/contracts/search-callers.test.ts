import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

// Chaque appelant de `searchPassages` passe l'`embedder` venu de `getEmbedder(env)` (C4 du plan du deuxième jet).
// En l'oubliant, la recherche reste en plein texte sans que personne le voie : aucune erreur, aucun test qui
// casse, seulement des résultats moins bons. Ce test lit les sources et refuse un appel sans `embedder`, ou dont
// l'`embedder` est écrit `null` ou `undefined`. D'où vient la valeur, il ne le voit pas : chaque appelant garde
// donc son test de route qui espionne `getEmbedder` (comme `mcp.db.test.ts` pour T07).

const SEARCH_FOLDER = 'src/server/search/';
const CALL = /\bsearchPassages\(/g;
const EMBEDDER_WORD = /\bembedder\b/;
// `embedder: null` ou `embedder: undefined`, où qu'il soit dans les arguments.
const EMBEDDER_EMPTY = /\bembedder\s*:\s*(?:null|undefined)\b/;

type Frame = { kind: 'template' } | { kind: 'expression'; braces: number };

// Le code d'un fichier TypeScript sans ses commentaires ni le contenu de ses chaînes, à longueur égale (les
// retours à la ligne restent, les numéros de ligne aussi) : un mot dans un commentaire ou dans une chaîne n'est
// pas un argument, et une parenthèse dans une chaîne ne ferme pas l'appel. Les gabarits (`${…}`) imbriqués sont
// suivis ; les expressions régulières ne sont pas lues (une `//` dans l'une d'elles masquerait la fin de sa ligne).
function maskNonCode(text: string): string {
  const frames: Frame[] = [];
  const out: string[] = [];
  const blank = (char: string | undefined) => (char === '\n' ? '\n' : ' ');
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);
    const top = frames[frames.length - 1];
    if (top?.kind === 'template') {
      if (char === '\\') {
        out.push(' ', blank(next));
        index += 2;
      } else if (char === '`') {
        frames.pop();
        out.push(char);
        index += 1;
      } else if (char === '$' && next === '{') {
        frames.push({ kind: 'expression', braces: 0 });
        out.push('$', '{');
        index += 2;
      } else {
        out.push(blank(char));
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text.charAt(index) !== '\n') {
        out.push(' ');
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;
      for (; index < end; index++) out.push(blank(text.charAt(index)));
      continue;
    }
    if (char === "'" || char === '"') {
      out.push(char);
      index += 1;
      while (index < text.length && text.charAt(index) !== char && text.charAt(index) !== '\n') {
        if (text.charAt(index) === '\\') {
          out.push(' ', blank(text.charAt(index + 1)));
          index += 2;
        } else {
          out.push(' ');
          index += 1;
        }
      }
      if (text.charAt(index) === char) {
        out.push(char);
        index += 1;
      }
      continue;
    }
    if (char === '`') {
      frames.push({ kind: 'template' });
      out.push(char);
      index += 1;
      continue;
    }
    if (top?.kind === 'expression') {
      if (char === '{') top.braces += 1;
      if (char === '}') {
        if (top.braces === 0) {
          frames.pop();
          out.push(char);
          index += 1;
          continue;
        }
        top.braces -= 1;
      }
    }
    out.push(char);
    index += 1;
  }
  return out.join('');
}

// Le texte des arguments d'un appel : de la parenthèse ouvrante à sa fermante (dans un texte déjà masqué).
function argumentsAt(masked: string, open: number): string {
  let depth = 0;
  for (let index = open; index < masked.length; index++) {
    const char = masked.charAt(index);
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return masked.slice(open, index + 1);
  }
  return masked.slice(open);
}

type Call = { line: number; args: string };

function callsIn(text: string): Call[] {
  const masked = maskNonCode(text);
  return [...masked.matchAll(CALL)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { line: masked.slice(0, open).split('\n').length, args: argumentsAt(masked, open) };
  });
}

const passesEmbedder = (args: string): boolean =>
  EMBEDDER_WORD.test(args) && !EMBEDDER_EMPTY.test(args);

function callers(): Array<Call & { path: string }> {
  return productionSources('src/**/*.{ts,tsx}')
    .filter(({ path }) => !path.startsWith(SEARCH_FOLDER))
    .flatMap(({ path, text }) => callsIn(text).map((call) => ({ ...call, path })));
}

describe('appelants de searchPassages', () => {
  it('en trouve au moins un : la lecture des sources fonctionne', () => {
    expect(callers().length).toBeGreaterThan(0);
  });

  it("passent tous l'embedder", () => {
    const missing = callers()
      .filter((call) => !passesEmbedder(call.args))
      .map((call) => `${call.path}:${call.line}`);

    expect(missing).toEqual([]);
  });
});

// Le test ne doit pas laisser passer l'oubli : des appels faux, que l'ancienne lecture acceptait ou que la
// nouvelle doit refuser, et des appels justes qu'elle doit garder.
describe('auto-vérification de la lecture des appels de searchPassages', () => {
  const refused = (code: string) => {
    const [call] = callsIn(code);
    return call !== undefined && !passesEmbedder(call.args);
  };
  const accepted = (code: string) => {
    const [call] = callsIn(code);
    return call !== undefined && passesEmbedder(call.args);
  };

  it('refuse un appel sans embedder', () => {
    expect(refused('await searchPassages(ctx, { query, filters });')).toBe(true);
  });

  it('refuse un embedder écrit null ou undefined', () => {
    expect(refused('await searchPassages(ctx, { query, embedder: null });')).toBe(true);
    expect(refused('await searchPassages(ctx, { query, embedder: undefined });')).toBe(true);
    expect(refused('await searchPassages(ctx, { query, embedder : null, filters });')).toBe(true);
  });

  it('refuse un embedder qui ne figure que dans un commentaire ou dans une chaîne', () => {
    expect(refused('await searchPassages(ctx, { query }); // embedder à ajouter')).toBe(true);
    expect(refused('await searchPassages(ctx, {\n  // embedder à ajouter\n  query,\n});')).toBe(
      true,
    );
    expect(refused('await searchPassages(ctx, { query /* embedder */ });')).toBe(true);
    expect(refused("await searchPassages(ctx, { query: 'embedder' });")).toBe(true);
    expect(refused('await searchPassages(ctx, { query: `embedder` });')).toBe(true);
  });

  it("ne confond pas une parenthèse dans une chaîne avec la fin de l'appel", () => {
    expect(
      refused("await searchPassages(ctx, { query: ')' }); const embedder = deps.embedder;"),
    ).toBe(true);
    expect(accepted("await searchPassages(ctx, { query: ')', embedder });")).toBe(true);
  });

  it('suit les gabarits imbriqués', () => {
    // Du code à lire, pas un gabarit : le `${` n'est jamais évalué.
    const open = '$' + '{';
    const nested = `await searchPassages(ctx, { query: \`a ${open}b ? \`c)\` : \`d\`} e\` }); const embedder = 1;`;
    const good = `await searchPassages(ctx, { query: \`a ${open}b ? \`c)\` : \`d\`}\`, embedder });`;

    expect(refused(nested)).toBe(true);
    expect(accepted(good)).toBe(true);
  });

  it('garde les appels justes', () => {
    expect(accepted('await searchPassages(ctx, { query, embedder });')).toBe(true);
    expect(accepted('await searchPassages(ctx, { query, embedder: deps.embedder });')).toBe(true);
    expect(accepted('await searchPassages(ctx, { query, embedder: getEmbedder(env) });')).toBe(
      true,
    );
    expect(accepted('await searchPassages(ctx, { query, embedder: nullEmbedder });')).toBe(true);
  });

  it("refuse un embedder nul même quand le mot figure ailleurs dans l'appel", () => {
    expect(refused('await searchPassages(ctx, { embedder: null, autre: deps.embedder });')).toBe(
      true,
    );
  });

  it('numérote la ligne de chaque appel', () => {
    const calls = callsIn(
      'a;\n// searchPassages(ctx, { embedder });\nsearchPassages(ctx, { embedder });\n',
    );

    expect(calls.map((call) => call.line)).toEqual([3]);
  });
});
