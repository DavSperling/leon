import type { ProviderId } from '@/capture/turn';
import type { CatalogField, CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { formatNumber, formatRelative } from './format';
import { PROVIDER_LABELS } from './providers';

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
  view: Pick<
    ConnectionView,
    'status' | 'lastSyncAt' | 'itemsSynced' | 'lastError' | 'createdBy' | 'creatorLeft'
  >,
  now: Date,
): string {
  if (view.creatorLeft) return `Arrêtée : ${view.createdBy.name} n'est plus membre`;
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

// Le bouton « Se connecter avec… » : une navigation (formulaire POST), pas une action serveur.
// L'adresse vient d'ici et jamais d'un littéral dans un composant.
export const oauthStartPath = (provider: ProviderId): string =>
  `/api/v1/connexions/oauth/${provider}/debut`;

export type PanelMode = 'oauth+key' | 'oauth' | 'key' | 'none';

// Ce que le panneau d'un outil propose : le bouton d'abord, la clé en secours. `none` : un outil
// qui ne se branche que par bouton, dont l'appli n'est pas configurée sur ce serveur.
export function panelMode(item: Pick<CatalogItem, 'oauthReady' | 'keyAccepted'>): PanelMode {
  if (item.oauthReady) return item.keyAccepted ? 'oauth+key' : 'oauth';
  return item.keyAccepted ? 'key' : 'none';
}

export const canReconnect = (view: Pick<ConnectionView, 'config'>): boolean =>
  view.config.authMode === 'oauth';

// « Synchroniser maintenant » : ni en pause, ni arrêtée (le créateur n'est plus membre, l'action refuse).
export const canSyncNow = (view: Pick<ConnectionView, 'status' | 'creatorLeft'>): boolean =>
  view.status !== 'paused' && !view.creatorLeft;

// Les codes que le retour de l'éditeur met dans `?erreur=` (voir oauth-routes.ts).
export const OAUTH_RETURN_CODES = [
  'annule',
  'expire',
  'refuse',
  'indisponible',
  'champs',
  'admin',
  'admin_accorde',
  'autre_compte',
  'vide',
] as const;
type OAuthReturnCode = (typeof OAUTH_RETURN_CODES)[number];

export type OAuthNotice = {
  tone: 'success' | 'error';
  text: string;
  tool: ProviderId | null;
  adminConsent: boolean; // la page joint le lien d'accord administrateur de l'outil
};

// Dit au retour d'Outlook (`admin`) et avant son bouton.
export const ADMIN_CONSENT_MESSAGE =
  "L'administrateur Microsoft de votre entreprise doit d'abord autoriser Leon.";

const providerOf = (value: unknown): ProviderId | null =>
  (Object.keys(PROVIDER_LABELS) as ProviderId[]).find((id) => id === value) ?? null;

const codeOf = (value: unknown): OAuthReturnCode | null =>
  OAUTH_RETURN_CODES.find((code) => code === value) ?? null;

// `subject` ouvre une phrase (« Linear », « L'outil »), `object` la suit (« Linear », « l'outil »).
function errorText(code: OAuthReturnCode, tool: ProviderId | null): string {
  const subject = tool ? PROVIDER_LABELS[tool] : "L'outil";
  const object = tool ? PROVIDER_LABELS[tool] : "l'outil";
  switch (code) {
    case 'annule':
      return `Connexion à ${object} annulée.`;
    case 'expire':
      return 'Le lien a expiré, recommencez.';
    case 'refuse':
      return `${subject} a refusé l'autorisation.`;
    case 'indisponible':
      return `${subject} ne répond pas, réessayez dans un moment.`;
    case 'champs':
      return 'Vérifiez les champs saisis.';
    case 'admin':
      return ADMIN_CONSENT_MESSAGE;
    case 'admin_accorde':
      return 'Accord donné : cliquez de nouveau sur Se connecter avec Outlook.';
    case 'autre_compte':
      return `Reconnectez ${object} avec le même compte et le même site, ou ajoutez une autre connexion.`;
    case 'vide':
      if (tool === 'airtable') {
        return 'Leon est connecté à Airtable, mais aucune base n’a été choisie. Reconnectez-vous et cochez au moins une base.';
      }
      if (tool === 'gitlab')
        return 'Leon est connecté à GitLab, mais vous n’êtes membre d’aucun projet.';
      return `Leon est connecté à ${object}, mais n'y a accès à rien pour l'instant.`;
  }
}

// Le message du retour de l'éditeur, lu dans l'adresse de la page. Une valeur inconnue (ou qui n'est
// pas un texte seul) ne dit rien, et rien de l'adresse n'est repris dans le message.
export function oauthNotice(params: {
  branche?: unknown;
  erreur?: unknown;
  outil?: unknown;
}): OAuthNotice | null {
  const code = codeOf(params.erreur);
  if (code) {
    const tool = providerOf(params.outil);
    return {
      tone: code === 'admin_accorde' ? 'success' : 'error',
      text: errorText(code, tool),
      tool,
      adminConsent: code === 'admin',
    };
  }
  const branche = providerOf(params.branche);
  if (!branche) return null;
  return {
    tone: 'success',
    text: `${PROVIDER_LABELS[branche]} est branché. La première synchronisation démarre dans la minute.`,
    tool: branche,
    adminConsent: false,
  };
}
