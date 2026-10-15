import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OperationSpec, ParamSpec, VendorSpec } from './vendor-spec';

// Produit src/test/contracts/vendor-specs/<id>.json à partir des specs publiques des fournisseurs :
// pour chaque requête qu'un connecteur envoie, la méthode, le chemin, les noms des paramètres (avec
// leurs valeurs permises quand la spec les énumère) et les champs du corps JSON. Les tests des
// connecteurs rejouent leurs requêtes contre ces extraits (voir vendor-spec.ts). Les extraits sont
// versionnés : ce script ne tourne que pour les mettre à jour.
//
//   NODE_USE_ENV_PROXY=1 node --import tsx src/test/contracts/extract-vendor-specs.ts [id…]
//
// Asana publie sa spec en YAML : on la convertit avec Ruby (présent sur macOS), faute de lecteur
// YAML dans les dépendances. Ajouter une requête à un connecteur = ajouter son opération ici, puis
// relancer. Une opération absente de toutes les sources de son connecteur arrête le script.
//
// Pas d'extrait pour GitLab, Trello, Plane, Airtable ni monday : leur spec publique omet des requêtes
// que le connecteur envoie (GitLab : /user et les notes ; Trello : `actions_limit`, et les champs
// séparés par des virgules que la spec traite comme une valeur), ou n'existe pas en lecture
// automatique (Plane, Airtable) ou est du GraphQL (monday). Leur doc se relit à la main.

const DIR = fileURLToPath(new URL('./vendor-specs/', import.meta.url));

const ATLASSIAN = 'https://developer.atlassian.com/cloud';

// Les opérations s'écrivent comme les connecteurs les envoient : « MÉTHODE /chemin/complet ».
const PLANS: Record<string, { sources: string[]; operations: string[] }> = {
  jira: {
    sources: [`${ATLASSIAN}/jira/platform/swagger-v3.v3.json`],
    operations: [
      'GET /rest/api/3/myself',
      'GET /rest/api/3/search/jql',
      'GET /rest/api/3/issue/{issueIdOrKey}/comment',
    ],
  },
  confluence: {
    sources: [
      `${ATLASSIAN}/confluence/openapi-v2.v3.json`,
      `${ATLASSIAN}/confluence/swagger.v3.json`,
    ],
    operations: [
      'GET /wiki/rest/api/user/current',
      'GET /wiki/api/v2/pages',
      'GET /wiki/api/v2/pages/{id}',
      'GET /wiki/api/v2/pages/{id}/footer-comments',
      'GET /wiki/api/v2/footer-comments/{id}/children',
      'POST /wiki/api/v2/users-bulk',
      'GET /wiki/api/v2/spaces',
    ],
  },
  shortcut: {
    sources: ['https://developer.shortcut.com/api/rest/v3/shortcut.swagger.json'],
    operations: [
      'GET /api/v3/member',
      'GET /api/v3/members',
      'POST /api/v3/stories/search',
      'GET /api/v3/stories/{story-public-id}/comments',
    ],
  },
  clickup: {
    sources: ['https://developer.clickup.com/openapi/clickup-api-v2-reference.json'],
    operations: [
      'GET /api/v2/user',
      'GET /api/v2/team',
      'GET /api/v2/team/{team_Id}/task',
      'GET /api/v2/task/{task_id}/comment',
    ],
  },
  sentry: {
    sources: [
      'https://raw.githubusercontent.com/getsentry/sentry-api-schema/main/openapi-derefed.json',
    ],
    operations: [
      'GET /api/0/organizations/{organization_id_or_slug}/issues/',
      'GET /api/0/organizations/{organization_id_or_slug}/issues/{issue_id}/',
    ],
  },
  asana: {
    sources: ['https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml'],
    operations: [
      'GET /api/1.0/users/{user_gid}',
      'GET /api/1.0/projects',
      'GET /api/1.0/tasks',
      'GET /api/1.0/tasks/{task_gid}/stories',
    ],
  },
};

type Schema = {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, unknown>;
  allOf?: Schema[];
};
type Param = Schema & { name?: string; in?: string; schema?: Schema };
type Body = { $ref?: string; content?: Record<string, { schema?: Schema }> };
type Operation = { parameters?: Param[]; requestBody?: Body };
type Spec = {
  info: { version: string };
  servers?: Array<{ url: string }>; // OpenAPI 3
  basePath?: string; // Swagger 2
  paths: Record<string, Record<string, Operation | Param[] | undefined>>;
};

async function readSpec(url: string): Promise<Spec> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : ${response.status}`);
  const text = await response.text();
  if (!url.endsWith('.yaml')) return JSON.parse(text) as Spec;
  const script = 'require "yaml"; require "json"; puts JSON.generate(YAML.load(STDIN.read))';
  const json = execFileSync('ruby', ['-e', script], { input: text, maxBuffer: 1 << 28 });
  return JSON.parse(json.toString('utf8')) as Spec;
}

// Le préfixe commun des chemins : « /wiki/api/v2 » pour la spec v2 de Confluence, « /api/1.0 » pour
// Asana.
function basePathOf(spec: Spec): string {
  const server = spec.servers?.[0]?.url;
  const raw = server ? new URL(server.replace(/\{[^}]+\}/g, 'x'), 'https://x.test').pathname : '';
  return (spec.basePath ?? raw).replace(/\/$/, '');
}

function pointer<T>(spec: Spec, node: T & { $ref?: string }): T {
  let current: T & { $ref?: string } = node;
  while (current.$ref) {
    const target = current.$ref
      .slice(2)
      .split('/')
      .reduce<unknown>((at, key) => {
        return (at as Record<string, unknown>)[key];
      }, spec);
    current = target as T & { $ref?: string };
  }
  return current;
}

function paramSpec(spec: Spec, param: Param): ParamSpec {
  const schema = pointer(spec, param.schema ?? param);
  const list = schema.type === 'array';
  const values = (list ? pointer(spec, schema.items ?? {}).enum : schema.enum)?.map(String);
  return { ...(list ? { list: true as const } : {}), ...(values?.length ? { values } : {}) };
}

function propertyNames(spec: Spec, schema: Schema): string[] {
  const resolved = pointer(spec, schema);
  const own = Object.keys(resolved.properties ?? {});
  return [...own, ...(resolved.allOf ?? []).flatMap((part) => propertyNames(spec, part))];
}

function operationSpec(
  spec: Spec,
  pathItem: Record<string, Operation | Param[] | undefined>,
  method: string,
) {
  const operation = pathItem[method.toLowerCase()] as Operation | undefined;
  if (!operation) return undefined;
  const shared = (pathItem.parameters as Param[] | undefined) ?? [];
  const params = [...shared, ...(operation.parameters ?? [])].map((param) => pointer(spec, param));
  const query: Record<string, ParamSpec> = {};
  for (const param of params.filter((p) => p.in === 'query' && p.name)) {
    query[param.name as string] = paramSpec(spec, param);
  }
  const requestBody = operation.requestBody && pointer(spec, operation.requestBody);
  const bodySchema =
    requestBody?.content?.['application/json']?.schema ??
    params.find((p) => p.in === 'body')?.schema;
  const result: OperationSpec = { query: sorted(query) };
  if (bodySchema) result.body = [...new Set(propertyNames(spec, bodySchema))].sort();
  return result;
}

const sorted = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

async function extract(id: string, plan: (typeof PLANS)[string]): Promise<VendorSpec> {
  const specs = await Promise.all(plan.sources.map(readSpec));
  const operations: Record<string, OperationSpec> = {};
  for (const key of plan.operations) {
    const [method = '', path = ''] = key.split(' ');
    for (const spec of specs) {
      const base = basePathOf(spec);
      const pathItem = spec.paths[path.slice(base.length)];
      const found = path.startsWith(base) && pathItem && operationSpec(spec, pathItem, method);
      if (found) {
        operations[key] = found;
        break;
      }
    }
    if (!operations[key]) throw new Error(`${id} : ${key} absent de ${plan.sources.join(', ')}`);
  }
  const versions = specs.map((spec) => spec.info.version);
  return { sources: plan.sources, versions, operations };
}

const wanted = process.argv.slice(2);
for (const [id, plan] of Object.entries(PLANS)) {
  if (wanted.length > 0 && !wanted.includes(id)) continue;
  const path = `${DIR}${id}.json`;
  writeFileSync(path, `${JSON.stringify(await extract(id, plan))}\n`);
  execFileSync('pnpm', ['exec', 'biome', 'format', '--write', path], { stdio: 'inherit' });
  console.log(`${id} : ${Object.keys(plan.operations).length} opérations`);
}
