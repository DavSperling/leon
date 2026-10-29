import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/server/env';
import {
  EFFORT_BY_STEP,
  modelForStep,
  SUPPORTED_MODEL_IDS,
  SUPPORTED_MODELS,
  type SupportedModel,
} from '@/server/llm/models';
import { TEST_ENV } from '@/test/test-env';
import { listFiles, productionSources, readText } from './files';

// Ce que le code dit du modèle d'IA doit rester d'accord avec ce qui est écrit ailleurs : la table des modèles
// (models.ts), l'annexe des prix, .env.example, le README, la table appels_modele, et qui a le droit
// d'importer le faux modèle.

const STEPS = Object.keys(EFFORT_BY_STEP);
const MODEL_ID = /claude-(?:haiku|sonnet|opus|fable|mythos)-\d+(?:-\d+)?/g;

describe('la table des modèles', () => {
  it('contient le modèle par défaut de chaque étape', () => {
    const env = parseEnv(TEST_ENV);
    for (const step of STEPS) {
      expect(SUPPORTED_MODEL_IDS, step).toContain(modelForStep(step as never, env));
    }
  });

  // Un modèle cité dans la doc ou le code qui n'est pas dans la table serait refusé au démarrage (env.ts) : la
  // consigne donnée à l'équipe doit marcher. Les tests ne sont pas lus : certains nomment exprès un modèle refusé.
  it('contient chaque modèle cité par .env.example, le README, la documentation et le code', () => {
    const files = [
      { path: '.env.example', text: readText('.env.example') },
      { path: 'README.md', text: readText('README.md') },
      ...listFiles('docs/guides/**/*.md').map((path) => ({ path, text: readText(path) })),
      ...productionSources('src/**/*.{ts,tsx}', 'extension/**/*.{ts,tsx}').filter(
        ({ path }) => !path.startsWith('src/test/'),
      ),
    ];
    const cited = files.flatMap(({ path, text }) =>
      (text.match(MODEL_ID) ?? []).map((model) => ({ path, model })),
    );

    expect(cited.length).toBeGreaterThan(0);
    expect(
      cited.filter(({ model }) => !SUPPORTED_MODEL_IDS.includes(model as SupportedModel)),
    ).toEqual([]);
  });
});

// La table de tarifs de models.ts est recopiée de l'annexe 01-prix-llm.md (page officielle des tarifs, revérifiée
// le 14/10/2026) : on met l'annexe à jour d'abord. Sans ce test, la source de vérité pourrait diverger en silence.
describe('les tarifs de models.ts et l’annexe des prix', () => {
  const ANNEXE = 'docs/etudes/couts-2026-10/annexes/01-prix-llm.md';
  // La ligne de chaque modèle dans le tableau « Anthropic » de l'annexe. Un modèle de plus dans la table sans
  // ligne ici ne compile pas.
  const ROW_LABEL = {
    'claude-haiku-5-5': 'Haiku 5.5, prompt ≤100k',
    'claude-sonnet-5-5': 'Sonnet 5.5',
    'claude-opus-5-5': 'Opus 5.5',
  } as const satisfies Record<SupportedModel, string>;

  // « | Opus 5.5 | 4 | 20 | 5 / 8 / 0.20 · 2 / 10 | A | » : entrée, sortie, puis le cache (écriture de 5 minutes,
  // écriture d'une heure, lecture) avant le « · » des prix par lot.
  function annexPrice(label: string) {
    const row = readText(ANNEXE)
      .split('\n')
      .find((line) => line.startsWith(`| ${label} |`));
    if (!row) throw new Error(`Ligne « ${label} » absente de ${ANNEXE}`);
    const cells = row.split('|').map((cell) => cell.trim());
    const [cacheWrite, , cacheRead] = (cells[4] ?? '').split('·')[0]?.split('/').map(Number) ?? [];
    return { input: Number(cells[2]), output: Number(cells[3]), cacheRead, cacheWrite };
  }

  it.each(SUPPORTED_MODEL_IDS)('%s : les quatre prix sont ceux de l’annexe', (model) => {
    expect(SUPPORTED_MODELS[model].price).toEqual(annexPrice(ROW_LABEL[model]));
  });
});

// La table appels_modele (0039), qui reçoit chaque appel au modèle, a un check sur `step`. Une étape du modèle
// d'IA absente de ce check ferait échouer chaque insertion de son usage, en silence (logUsage n'attend pas).
describe('la table appels_modele', () => {
  // Les valeurs du dernier `check (step in (...))` de ce SQL, ou null s'il n'y en a pas.
  function stepsAllowedBy(sql: string): string[] | null {
    const checks = [...sql.matchAll(/step\s+in\s*\(([^)]*)\)/gi)];
    const last = checks.at(-1)?.[1];
    if (last === undefined) return null;
    return [...last.matchAll(/'([^']*)'/g)].map((match) => match[1] as string);
  }
  const migrations = listFiles('src/server/db/migrations/*.sql').map(readText);
  const usageSql = migrations.filter((sql) => /appels_modele/i.test(sql)).join('\n');

  it('lit le check sur `step` : la forme de la migration 0039', () => {
    const sql = `create table appels_modele (id bigint primary key, step text not null check (step in ('triage', 'extraction')));`;
    expect(stepsAllowedBy(sql)).toEqual(['triage', 'extraction']);
    expect(stepsAllowedBy('create table autre (id uuid)')).toBeNull();
    // Un check ajouté plus tard remplace le premier.
    expect(
      stepsAllowedBy(
        `${sql} alter table appels_modele add constraint c check (step in ('reponse'));`,
      ),
    ).toEqual(['reponse']);
  });

  it('accepte chaque étape du modèle d’IA', () => {
    expect(usageSql).toMatch(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?appels_modele\b/i,
    );
    const allowed = stepsAllowedBy(usageSql);
    expect(allowed, 'la migration d’appels_modele doit contraindre `step`').not.toBeNull();
    expect(STEPS.filter((step) => !(allowed ?? []).includes(step))).toEqual([]);
  });
});

// Le faux modèle des tests (createFakeLlm) et celui des démonstrations (createDemoLlm) vivent dans le même
// fichier. Rien dans le code de production ne doit importer le faux des tests : seul get-llm.ts importe fake-llm.ts,
// et seulement le faux de démonstration. (src/test/ et les fichiers de test sont libres de l'importer.)
describe('fake-llm.ts', () => {
  const IMPORT_FAKE = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*fake-llm['"]/g;

  it('n’est importé, hors tests, que par get-llm.ts, et pour createDemoLlm seulement', () => {
    const importers = productionSources('src/**/*.{ts,tsx}', 'extension/**/*.{ts,tsx}')
      .filter(({ path }) => !path.startsWith('src/test/') && path !== 'src/server/llm/fake-llm.ts')
      .flatMap(({ path, text }) => {
        const anyImport = /from\s+['"][^'"]*fake-llm['"]/.test(text);
        const names = [...text.matchAll(IMPORT_FAKE)].flatMap((match) =>
          (match[2] ?? '').split(',').map((name) => name.trim()),
        );
        return anyImport ? [{ path, names }] : [];
      });

    expect(importers).toEqual([{ path: 'src/server/llm/get-llm.ts', names: ['createDemoLlm'] }]);
  });
});

// env.ts importe la liste des modèles de models.ts pour refuser un réglage inconnu au démarrage : models.ts ne doit
// donc rien importer de env.ts à l'exécution (le type Env suffit), sinon un cycle se ferme.
describe('env.ts et models.ts', () => {
  it('env.ts ne dépend du dossier llm que par models.ts', () => {
    const imports = [...readText('src/server/env.ts').matchAll(/from '(\.\/llm\/[^']+)'/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(['./llm/models']);
  });

  it('models.ts n’importe aucune valeur : seulement des types', () => {
    const valueImports = readText('src/server/llm/models.ts')
      .split('\n')
      .filter((line) => /^import\s+(?!type\b)/.test(line));
    expect(valueImports).toEqual([]);
  });
});
