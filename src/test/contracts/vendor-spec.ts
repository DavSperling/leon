import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Un extrait de la spec officielle d'un fournisseur (vendor-specs/<id>.json, produit par
// extract-vendor-specs.ts) : ce que la doc permet d'envoyer à chaque opération qu'un connecteur
// utilise. Les tests des connecteurs y confrontent chaque requête qu'ils font (testHttp) : un
// chemin, un paramètre, une valeur énumérée ou un champ de corps que la spec ne cite pas fait
// échouer le test. Les fausses réponses (fakeFetch) ne contrôlent rien de cela d'elles-mêmes.

const ParamSchema = z.object({
  list: z.literal(true).optional(), // plusieurs valeurs, séparées par des virgules ou répétées
  values: z.array(z.string()).optional(), // les valeurs permises, quand la spec les énumère
});
const OperationSchema = z.object({
  query: z.record(z.string(), ParamSchema),
  body: z.array(z.string()).optional(), // les champs du corps JSON, quand la spec en décrit un
});
const VendorSpecSchema = z.object({
  sources: z.array(z.string()),
  versions: z.array(z.string()),
  operations: z.record(z.string(), OperationSchema), // « MÉTHODE /chemin/{variable} »
});

export type ParamSpec = z.infer<typeof ParamSchema>;
export type OperationSpec = z.infer<typeof OperationSchema>;
export type VendorSpec = z.infer<typeof VendorSpecSchema>;

const DIR = fileURLToPath(new URL('./vendor-specs/', import.meta.url));

// Rien pour un connecteur dont l'extrait n'a pas été produit.
export function loadVendorSpec(id: string): VendorSpec | undefined {
  const path = `${DIR}${id}.json`;
  return existsSync(path)
    ? VendorSpecSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    : undefined;
}

const templateMatches = (template: string, path: string): boolean =>
  new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path);

export type SentCall = { method: string; url: string; body?: unknown };

// Par api.atlassian.com, les appels de Jira et de Confluence portent /ex/<produit>/<cloudId> avant le
// chemin que décrit la spec.
const ATLASSIAN_GATEWAY_PREFIX = /^\/ex\/(?:jira|confluence)\/[^/]+/;

function specPath(url: URL): string {
  return url.host === 'api.atlassian.com'
    ? url.pathname.replace(ATLASSIAN_GATEWAY_PREFIX, '')
    : url.pathname;
}

// Ce que la requête envoie de plus que la spec : une liste vide quand tout y figure.
export function callProblems(spec: VendorSpec, call: SentCall): string[] {
  const url = new URL(call.url);
  const operation = Object.entries(spec.operations).find(([key]) => {
    const [method = '', template = ''] = key.split(' ');
    return method === call.method && templateMatches(template, specPath(url));
  })?.[1];
  if (!operation) return [`${call.method} ${url.pathname} : absent de la spec`];

  const problems: string[] = [];
  for (const name of new Set(url.searchParams.keys())) {
    const param = operation.query[name];
    if (!param) {
      problems.push(`paramètre « ${name} » absent de la spec`);
      continue;
    }
    for (const raw of url.searchParams.getAll(name)) {
      for (const value of param.list ? raw.split(',') : [raw]) {
        if (param.values && !param.values.includes(value)) {
          problems.push(`valeur « ${value} » absente de la spec pour « ${name} »`);
        }
      }
    }
  }
  if (typeof call.body === 'object' && call.body !== null) {
    const fields = operation.body;
    for (const name of Object.keys(call.body)) {
      if (!fields?.includes(name)) problems.push(`champ de corps « ${name} » absent de la spec`);
    }
  }
  return problems;
}
