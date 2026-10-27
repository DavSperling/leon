import { safeUrl } from './safe-url';

// Les actions que Leon propose dans une discussion et que l'utilisateur confirme d'un clic (lot 7 de
// docs/specs/2026-10-26-github-acces-complet.md) : le contrat entre le serveur et la page. Le navigateur n'importe
// rien de `@/server`.

export const ACTION_KINDS = ['github.creer_branche'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// proposee → en-cours (le clic, une seule fois) → faite ou echouee ; ou annulee.
export const ACTION_STATUSES = ['proposee', 'en-cours', 'faite', 'echouee', 'annulee'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// Une proposition se confirme dans l'heure : au-delà, ce qu'elle montre (le commit de départ) a pu changer.
// Elle s'affiche alors « expiree » et ne s'exécute plus.
export const ACTION_VALID_MS = 60 * 60 * 1000;

// Pourquoi une action a échoué, traduit par la page : jamais le texte de l'outil.
export const ACTION_ERRORS = ['droits', 'existe', 'introuvable', 'connexion', 'echec'] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

export type BranchParams = { repo: string; branch: string; from: string; sha: string };

export type ActionView = {
  id: string;
  kind: 'github.creer_branche';
  params: BranchParams;
  status: ActionStatus | 'expiree';
  // faite : l'adresse sur l'outil ; echouee : la raison.
  result: { url: string | null; error: ActionError | null };
};

const STATUSES: readonly string[] = [...ACTION_STATUSES, 'expiree'];
const ERRORS: readonly string[] = ACTION_ERRORS;
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

// Une action du contrat (une ligne relue, un évènement du flux), avec ses seuls champs connus, ou null.
export function parseActionView(value: unknown): ActionView | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, kind, params, status, result } = value as Record<string, unknown>;
  if (!isString(id) || kind !== 'github.creer_branche') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  const { repo, branch, from, sha } = (params ?? {}) as Record<string, unknown>;
  if (![repo, branch, from, sha].every(isString)) return null;
  const { url, error } = (result ?? {}) as Record<string, unknown>;
  return {
    id,
    kind,
    params: { repo, branch, from, sha } as BranchParams,
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
