import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { productionSources } from './files';

// Chaque clé de traduction que le code lit existe en français et en anglais. Le typecheck la vérifie déjà contre
// fr.json, mais pas dans la suite de tests : un `tsc --noEmit` incrémental (tsconfig.tsbuildinfo chaud) est resté vert
// après le renommage d'une clé de messages/fr.json, et messages.test.ts ne compare que les deux fichiers entre eux.
// Ce balayage lit les clés dans le code, jamais dans une liste recopiée : `t('clé')`, `t.rich('clé')` et la clé en
// gabarit `t(`client${id}Name`)`. Limites : une clé passée par une variable n'est pas vue, et une clé en gabarit n'est
// vérifiée que par sa forme (une clé de cette forme existe) ; le typecheck la vérifie en entier.

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
  );
}

const LEAVES = { fr: leaves(fr), en: leaves(en) };

// `const t = useTranslations('ns')`, `const t = await getTranslations('ns')` ou `createTranslator({ …, namespace: 'ns' })`.
const BINDING =
  /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:(?:useTranslations|getTranslations)\(\s*'([\w.]+)'\s*\)|createTranslator\(\s*\{[^}]*namespace:\s*'([\w.]+)'[^}]*\}\s*\))/g;
// `(await getTranslations('ns'))('clé')`, sans variable.
const INLINE = /\(await getTranslations\('([\w.]+)'\)\)\(\s*'([\w.]+)'/g;
// Une lecture : nom('clé'), nom.rich('clé'), nom.raw('clé'), ou la clé en gabarit.
const READ = /\b(\w+)(?:\.(?:rich|raw|markup))?\(\s*(?:'([\w.]+)'|`((?:[^`$]|\$\{[^}]*\})*)`)/g;

type Read = { file: string; key: string };

// Les lectures d'un fichier, chacune dans l'espace de noms du dernier `t` lié sous ce nom avant elle.
function readsOf(file: string, text: string): Read[] {
  const bindings = [...text.matchAll(BINDING)].map((match) => ({
    at: match.index,
    name: match[1],
    namespace: match[2] ?? match[3],
  }));
  const reads = [...text.matchAll(READ)].flatMap((match) => {
    const binding = bindings.findLast((one) => one.name === match[1] && one.at < match.index);
    return binding ? [{ file, key: `${binding.namespace}.${match[2] ?? match[3]}` }] : [];
  });
  return [
    ...reads,
    ...[...text.matchAll(INLINE)].map((match) => ({ file, key: `${match[1]}.${match[2]}` })),
  ];
}

const escapeRegex = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `client${id}Name` : toute clé de la forme client…Name, sans point.
const patternOf = (key: string) =>
  new RegExp(
    `^${key
      .split(/\$\{[^}]*\}/)
      .map(escapeRegex)
      .join('[^.]+')}$`,
  );

const READS = productionSources('src/**/*.{ts,tsx}').flatMap(({ path, text }) =>
  readsOf(path, text),
);

describe('clés de traduction lues par le code', () => {
  it('trouve les lectures du code, celles de la page d’autorisation et des Réglages comprises', () => {
    const keys = READS.map(({ key }) => key);

    expect(keys.length).toBeGreaterThan(1000);
    expect(keys).toEqual(
      expect.arrayContaining([
        'oauth.authorize.title',
        'settings.connectedTitle',
        `settings.client\${id}Name`,
      ]),
    );
  });

  it.each(['fr', 'en'] as const)('chacune existe dans messages/%s.json', (locale) => {
    const known = LEAVES[locale];
    const missing = READS.filter(({ key }) =>
      key.includes('${') ? !known.some((leaf) => patternOf(key).test(leaf)) : !known.includes(key),
    ).map(({ file, key }) => `${file} : ${key}`);

    expect(missing).toEqual([]);
  });
});
