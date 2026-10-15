import type { CatalogField } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { formatNumber, formatRelative } from './format';

// Fonctions pures de la page Connexions. Ce module n'est pas un composant client : une action
// serveur ne peut pas appeler une fonction d'un module client, et la page comme l'action s'en servent.

export const SINCE_VALUES = ['7', '30', '90', '365'] as const;
export type SinceDays = (typeof SINCE_VALUES)[number];
export const DEFAULT_SINCE: SinceDays = '30';
export const SINCE_LABELS: Record<SinceDays, string> = {
  '7': '7 derniers jours',
  '30': '30 derniers jours',
  '90': '90 derniers jours',
  '365': '1 an',
};

export type ActionResult = { ok: true; account: string } | { error: string };

export function inputTypeFor(
  field: Pick<CatalogField, 'kind'>,
): 'password' | 'text' | 'textarea' | 'select' {
  if (field.kind === 'secret') return 'password';
  if (field.kind === 'list') return 'textarea';
  return field.kind;
}

// Seuls les champs du catalogue passent. Les espaces et le retour à la ligne d'une clé collée sont
// retirés ; un champ vide est omis (le schéma du connecteur dit s'il était requis), une liste vide
// reste une liste vide.
export function fieldsFromForm(
  fields: ReadonlyArray<Pick<CatalogField, 'name' | 'kind'>>,
  values: Record<string, string>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const { name, kind } of fields) {
    const raw = values[name] ?? '';
    if (kind === 'list') {
      result[name] = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (raw.trim() !== '') {
      result[name] = raw.trim();
    }
  }
  return result;
}

// Jamais la valeur saisie : seulement le libellé des champs refusés, dans l'ordre du formulaire.
export function invalidFieldsMessage(
  fields: ReadonlyArray<Pick<CatalogField, 'name' | 'label'>>,
  names: readonly string[],
): string {
  const labels = fields.filter((field) => names.includes(field.name)).map((field) => field.label);
  return labels.length === 0
    ? 'Vérifiez les champs saisis.'
    : `Vérifiez les champs : ${labels.join(', ')}`;
}

// formatRelative écrit une date nue au-delà de deux jours : on la fait précéder de « le ».
function sinceText(date: Date, now: Date): string {
  const relative = formatRelative(date, now);
  return /^\d/.test(relative) ? `le ${relative}` : relative;
}

export function statusLine(
  view: Pick<ConnectionView, 'status' | 'lastSyncAt' | 'itemsSynced' | 'lastError'>,
  now: Date,
): string {
  if (view.status === 'paused') return 'En pause';
  if (view.status === 'error')
    return view.lastError ? `En erreur : ${view.lastError}` : 'En erreur';
  if (!view.lastSyncAt) return 'Actif · premier passage en attente';
  const count = `${formatNumber(view.itemsSynced)} ${view.itemsSynced > 1 ? 'éléments' : 'élément'}`;
  return `Actif · dernier passage ${sinceText(view.lastSyncAt, now)} · ${count}`;
}

export function resultMessage(result: ActionResult): string {
  return 'error' in result ? result.error : `Connecté : ${result.account}`;
}

// Deux personnes qui branchent le même espace lisent deux fois les mêmes éléments.
export function otherOwnersNote(
  connections: ReadonlyArray<Pick<ConnectionView, 'createdBy'>>,
  viewerId: string,
): string | null {
  const names = new Map<string, string>();
  for (const { createdBy } of connections) {
    if (createdBy.id !== viewerId) names.set(createdBy.id, createdBy.name);
  }
  const list = [...names.values()];
  if (list.length === 0) return null;
  const last = list.pop();
  return `Déjà branché par ${list.length === 0 ? last : `${list.join(', ')} et ${last}`}.`;
}
