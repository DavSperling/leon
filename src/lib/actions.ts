import { safeUrl } from './safe-url';

// Les actions que Leon propose dans une discussion et que l'utilisateur confirme d'un clic (lot 7 de
// docs/specs/2026-10-26-github-acces-complet.md) : le contrat entre le serveur et la page. Le navigateur n'importe
// rien de `@/server`.

export const ACTION_KINDS = [
  'github.creer_branche',
  'github.supprimer_branche',
  'github.ecrire_fichier',
  'github.supprimer_fichier',
  'github.ouvrir_pr',
  'github.modifier_pr',
  'github.fusionner_pr',
  'github.commenter',
  'github.demander_revue',
  'github.soumettre_revue',
  'github.creer_ticket',
  'github.modifier_ticket',
  'github.relancer_execution',
  'github.annuler_execution',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
// Le nom d'une action sans son préfixe : la clé de ses textes (une clé de traduction n'a pas de « . »).
export type ActionName = ActionKind extends `github.${infer Name}` ? Name : never;
export const actionName = (kind: ActionKind) => kind.slice('github.'.length) as ActionName;

// Les paramètres de chaque action, toutes valeurs en texte : ceux qu'elle doit porter et ceux qu'elle peut porter.
// Une autre clé est refusée (validParams côté serveur) et écartée (parseActionView). `asked`, facultatif partout, est
// un extrait de la demande de l'utilisateur, montré sur la carte pour qu'il voie ce qui a déclenché l'action.
const keys = (required: string[], optional: string[] = []) => ({
  required,
  optional: [...optional, 'asked'],
});
export const ACTION_KEYS: Record<ActionKind, { required: string[]; optional: string[] }> = {
  'github.creer_branche': keys(['repo', 'branch', 'from', 'sha']),
  'github.supprimer_branche': keys(['repo', 'branch', 'sha']),
  'github.ecrire_fichier': keys(
    ['repo', 'branch', 'path', 'message', 'content', 'diff'],
    // sha absent : le fichier est nouveau ; default « oui » : la branche est la branche par défaut.
    ['sha', 'default'],
  ),
  'github.supprimer_fichier': keys(
    ['repo', 'branch', 'path', 'message', 'sha', 'lines'],
    ['default'],
  ),
  'github.ouvrir_pr': keys(['repo', 'head', 'base', 'title', 'body', 'draft']),
  'github.modifier_pr': keys(['repo', 'number', 'current'], ['title', 'body', 'state']),
  'github.fusionner_pr': keys(['repo', 'number', 'title', 'base', 'method', 'sha']),
  'github.commenter': keys(['repo', 'number', 'title', 'body']),
  'github.demander_revue': keys(['repo', 'number', 'title', 'reviewers']),
  'github.soumettre_revue': keys(['repo', 'number', 'title', 'event', 'body', 'sha']),
  'github.creer_ticket': keys(['repo', 'title'], ['body', 'labels', 'assignees']),
  'github.modifier_ticket': keys(
    ['repo', 'number', 'current'],
    ['title', 'body', 'state', 'labels', 'assignees'],
  ),
  'github.relancer_execution': keys(['repo', 'run', 'name', 'failed'], ['branch']),
  'github.annuler_execution': keys(['repo', 'run', 'name'], ['branch']),
};

// proposee → en-cours (le clic, une seule fois) → faite ou echouee ; ou annulee.
export const ACTION_STATUSES = ['proposee', 'en-cours', 'faite', 'echouee', 'annulee'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// Une proposition se confirme dans l'heure : au-delà, ce qu'elle montre (le commit de départ) a pu changer.
// Elle s'affiche alors « expiree » et ne s'exécute plus.
export const ACTION_VALID_MS = 60 * 60 * 1000;

// Pourquoi une action a échoué, traduit par la page : jamais le texte de l'outil.
export const ACTION_ERRORS = [
  'droits',
  'existe',
  'introuvable',
  'connexion',
  'echec',
  'conflit',
  'refus',
  'incertain', // l'écriture est partie sans réponse : elle a peut-être été faite
] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

export type ActionView = {
  id: string;
  kind: ActionKind;
  params: Record<string, string>;
  status: ActionStatus | 'expiree';
  // faite : l'adresse sur l'outil ; echouee : la raison.
  result: { url: string | null; error: ActionError | null };
};

export type ActionWarning = 'rerunWarning' | 'defaultBranchWarning' | 'workflowWarning';
const WORKFLOWS_DIR = '.github/workflows/';
// Ce que l'action a de plus grave que ce qu'elle dit : la carte l'écrit avant le clic, qui l'exécute sans autre relecture.
export function actionWarnings(
  kind: ActionKind,
  params: Record<string, string | undefined>,
): ActionWarning[] {
  const warnings: ActionWarning[] = [];
  if (kind === 'github.relancer_execution') warnings.push('rerunWarning');
  if (params.default === 'oui') warnings.push('defaultBranchWarning');
  if (params.path?.startsWith(WORKFLOWS_DIR)) warnings.push('workflowWarning');
  return warnings;
}

const STATUSES: readonly string[] = [...ACTION_STATUSES, 'expiree'];
const ERRORS: readonly string[] = ACTION_ERRORS;
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isKind = (value: unknown): value is ActionKind => ACTION_KINDS.includes(value as ActionKind);

// Une action du contrat (une ligne relue, un évènement du flux), avec ses seuls champs et paramètres connus, ou null.
export function parseActionView(value: unknown): ActionView | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, kind, params, status, result } = value as Record<string, unknown>;
  if (!isString(id) || !isKind(kind)) return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  const given = (typeof params === 'object' && params !== null ? params : {}) as Record<
    string,
    unknown
  >;
  const { required, optional } = ACTION_KEYS[kind];
  const kept: Record<string, string> = {};
  for (const key of [...required, ...optional]) {
    const item = given[key];
    if (typeof item === 'string') kept[key] = item;
  }
  if (!required.every((key) => key in kept)) return null;
  const { url, error } = (result ?? {}) as Record<string, unknown>;
  return {
    id,
    kind,
    params: kept,
    status: status as ActionView['status'],
    // Le lien finit dans un `href` : un lien ni http ni https est retiré.
    result: {
      url: typeof url === 'string' ? safeUrl(url) : null,
      error: typeof error === 'string' && ERRORS.includes(error) ? (error as ActionError) : null,
    },
  };
}

export function parseActionViews(value: unknown): ActionView[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseActionView).filter((item): item is ActionView => item !== null);
}
