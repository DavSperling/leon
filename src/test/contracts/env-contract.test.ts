import { describe, expect, it } from 'vitest';
import { EMBEDDER_IDS } from '@/server/embeddings/embedder';
import { productionSources, readText } from './files';

// Gérées par Next, jamais dans .env.example.
const MANAGED_BY_NEXT = ['NODE_ENV', 'NEXT_RUNTIME', 'NEXT_PHASE'];

// Fichiers dont un schéma zod nomme les variables lues.
const SCHEMA_FILES = ['src/server/env.ts', 'src/cli/env.ts', 'src/server/db/migrate-cli.ts'];

const names = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] as string);

function documentedVariables(): Set<string> {
  return new Set(names(readText('.env.example'), /^#?\s*([A-Z][A-Z0-9_]*)=/gm));
}

function readVariables(): Set<string> {
  const found = new Set<string>();
  for (const { path, text } of productionSources('src/**/*.{ts,tsx}', 'extension/**/*.{ts,tsx}')) {
    for (const name of names(
      text,
      /(?:process\.env|import\.meta\.env|\bsource)\.([A-Z][A-Z0-9_]*)/g,
    )) {
      found.add(name);
    }
    if (SCHEMA_FILES.includes(path)) {
      for (const name of names(text, /\b([A-Z][A-Z0-9_]*): z\./g)) found.add(name);
    }
  }
  for (const name of MANAGED_BY_NEXT) found.delete(name);
  return found;
}

// Le commentaire (lignes « # ») qui précède immédiatement une variable de .env.example.
function commentBefore(variable: string): string {
  const lines = readText('.env.example').split('\n');
  const index = lines.indexOf(`${variable}=`);
  if (index === -1) throw new Error(`${variable}= est absente de .env.example`);
  let start = index;
  while (start > 0 && lines[start - 1]?.startsWith('#')) start -= 1;
  return lines.slice(start, index).join(' ');
}

describe('variables d’environnement', () => {
  it('trouve les variables que le code lit', () => {
    expect([...readVariables()].sort()).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'LEON_TOKEN', 'WXT_PUBLIC_LEON_URL']),
    );
  });

  it('documente dans .env.example chaque variable lue par le code', () => {
    const documented = documentedVariables();
    expect([...readVariables()].filter((name) => !documented.has(name))).toEqual([]);
  });

  it('ne documente dans .env.example que des variables lues par le code', () => {
    const read = readVariables();
    expect([...documentedVariables()].filter((name) => !read.has(name))).toEqual([]);
  });

  it('laisse LEON_EMBEDDINGS vide dans .env.example : le fournisseur de vecteurs est à choisir par Amos et David', () => {
    expect(readText('.env.example')).toMatch(/^LEON_EMBEDDINGS=$/m);
    expect(commentBefore('LEON_EMBEDDINGS')).toMatch(/Amos et David/);
  });

  it('nomme, dans le commentaire de LEON_EMBEDDINGS, chaque fournisseur que la variable accepte', () => {
    const comment = commentBefore('LEON_EMBEDDINGS');
    expect(EMBEDDER_IDS.filter((id) => !comment.includes(id))).toEqual([]);
  });

  it('laisse LEON_LLM en commentaire dans .env.example : le faux modèle n’a pas de valeur par défaut', () => {
    expect(readText('.env.example')).toMatch(/^# LEON_LLM=$/m);
    expect(readText('.env.example')).not.toMatch(/^LEON_LLM=/m);
  });

  it('laisse vides les modèles par étape dans .env.example : le défaut vit dans le code', () => {
    for (const variable of ['LEON_MODEL_REPONSE', 'LEON_MODEL_DISCUSSION', 'LEON_MODEL_POINT']) {
      expect(readText('.env.example')).toMatch(new RegExp(`^${variable}=$`, 'm'));
    }
  });

  it('dit, dans le commentaire de LEON_EMBEDDINGS, que seul le fournisseur factice marche pour l’instant', () => {
    // À réécrire quand T30 livre les adaptateurs de Voyage, de Mistral et de bge-m3.
    expect(commentBefore('LEON_EMBEDDINGS')).toMatch(/pas encore branchés/);
    expect(commentBefore('LEON_EMBEDDINGS')).toMatch(/seul « factice » marche/);
  });
});

// env.ts importe la liste des fournisseurs ; un fournisseur qui importerait env à son tour fermerait un cycle
// (env, registre, fournisseur, env). Le registre et les fournisseurs reçoivent leur réglage en argument.
describe('env.ts et les fournisseurs de vecteurs', () => {
  it('env.ts ne dépend que de embedder.ts, la feuille du dossier des fournisseurs', () => {
    const imports = names(readText('src/server/env.ts'), /from '(\.\/embeddings\/[^']+)'/g);
    expect(imports).toEqual(['./embeddings/embedder']);
  });

  it('aucun fichier des fournisseurs n’importe la valeur env (le type Env suffit)', () => {
    const valueImports = productionSources('src/server/embeddings/*.ts')
      .filter(({ text }) =>
        /^import\s+(?!type\b)[^;]*from\s+['"](\.\.\/env|@\/server\/env)['"]/m.test(text),
      )
      .map(({ path }) => path);
    expect(valueImports).toEqual([]);
  });
});
