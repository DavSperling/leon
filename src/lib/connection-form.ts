import type { ProviderId } from '@/capture/turn';
import type { CatalogField, CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';
import { formatNumber } from './format';
import { PROVIDER_LABELS } from './providers';
import { formatSince } from './verre/format';

// Fonctions pures de la page Connexions. Ce module n'est pas un composant client : une action
// serveur ne peut pas appeler une fonction d'un module client, et la page comme l'action s'en servent.
// Les textes sont en français, ou en anglais avec `locale` 'en'.

export const SINCE_VALUES = ['7', '30', '90', '365'] as const;
export type SinceDays = (typeof SINCE_VALUES)[number];
export const DEFAULT_SINCE: SinceDays = '30';

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
  locale = 'fr',
): string {
  const labels = fields.filter((field) => names.includes(field.name)).map((field) => field.label);
  if (locale === 'en')
    return labels.length === 0
      ? 'Check the fields you entered.'
      : `Check these fields: ${labels.join(', ')}`;
  return labels.length === 0
    ? 'Vérifiez les champs saisis.'
    : `Vérifiez les champs : ${labels.join(', ')}`;
}

export function statusLine(
  view: Pick<
    ConnectionView,
    'status' | 'lastSyncAt' | 'itemsSynced' | 'lastError' | 'createdBy' | 'creatorLeft'
  >,
  now: Date,
  locale = 'fr',
): string {
  if (locale === 'en') {
    if (view.creatorLeft) return `Stopped: ${view.createdBy.name} is no longer a member`;
    if (view.status === 'paused') return 'Paused';
    if (view.status === 'error') return view.lastError ? `Error: ${view.lastError}` : 'Error';
    if (!view.lastSyncAt) return 'Active · first sync pending';
    const items = `${formatNumber(view.itemsSynced, locale)} ${view.itemsSynced === 1 ? 'item' : 'items'}`;
    return `Active · last sync ${formatSince(view.lastSyncAt, now, locale)} · ${items}`;
  }
  if (view.creatorLeft) return `Arrêtée : ${view.createdBy.name} n'est plus membre`;
  if (view.status === 'paused') return 'En pause';
  if (view.status === 'error')
    return view.lastError ? `En erreur : ${view.lastError}` : 'En erreur';
  if (!view.lastSyncAt) return 'Actif · premier passage en attente';
  const count = `${formatNumber(view.itemsSynced)} ${view.itemsSynced > 1 ? 'éléments' : 'élément'}`;
  return `Actif · dernier passage ${formatSince(view.lastSyncAt, now)} · ${count}`;
}

export function resultMessage(result: ActionResult, locale = 'fr'): string {
  if ('error' in result) return result.error;
  return locale === 'en' ? `Connected: ${result.account}` : `Connecté : ${result.account}`;
}

// Deux personnes qui branchent le même espace lisent deux fois les mêmes éléments.
export function otherOwnersNote(
  connections: ReadonlyArray<Pick<ConnectionView, 'createdBy'>>,
  viewerId: string,
  locale = 'fr',
): string | null {
  const names = new Map<string, string>();
  for (const { createdBy } of connections) {
    if (createdBy.id !== viewerId) names.set(createdBy.id, createdBy.name);
  }
  const list = [...names.values()];
  if (list.length === 0) return null;
  const last = list.pop();
  if (locale === 'en')
    return `Already connected by ${list.length === 0 ? last : `${list.join(', ')} and ${last}`}.`;
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

// Branchée par le bouton, chez l'éditeur ou par Pipedream.
export const canReconnect = (view: Pick<ConnectionView, 'config'>): boolean =>
  view.config.authMode === 'oauth' || view.config.authMode === 'pipedream';

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
export const ADMIN_CONSENT_MESSAGE_EN =
  'Your company’s Microsoft administrator must approve Leon first.';

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

function errorTextEn(code: OAuthReturnCode, tool: ProviderId | null): string {
  const subject = tool ? PROVIDER_LABELS[tool] : 'The tool';
  const object = tool ? PROVIDER_LABELS[tool] : 'the tool';
  switch (code) {
    case 'annule':
      return `Connection to ${object} cancelled.`;
    case 'expire':
      return 'The link expired. Please start again.';
    case 'refuse':
      return `${subject} denied the authorization.`;
    case 'indisponible':
      return `${subject} isn’t responding. Try again in a moment.`;
    case 'champs':
      return 'Check the fields you entered.';
    case 'admin':
      return ADMIN_CONSENT_MESSAGE_EN;
    case 'admin_accorde':
      return 'Consent granted: click Continue with Outlook again.';
    case 'autre_compte':
      return `Reconnect ${object} with the same account and site, or add another connection.`;
    case 'vide':
      if (tool === 'airtable') {
        return 'Leon is connected to Airtable, but no base was selected. Reconnect and select at least one base.';
      }
      if (tool === 'gitlab')
        return 'Leon is connected to GitLab, but you aren’t a member of any project.';
      return `Leon is connected to ${object}, but can’t access anything yet.`;
  }
}

// Le message du retour de l'éditeur, lu dans l'adresse de la page. Une valeur inconnue (ou qui n'est
// pas un texte seul) ne dit rien, et rien de l'adresse n'est repris dans le message.
export function oauthNotice(
  params: {
    branche?: unknown;
    erreur?: unknown;
    outil?: unknown;
  },
  locale = 'fr',
): OAuthNotice | null {
  const code = codeOf(params.erreur);
  if (code) {
    const tool = providerOf(params.outil);
    return {
      tone: code === 'admin_accorde' ? 'success' : 'error',
      text: locale === 'en' ? errorTextEn(code, tool) : errorText(code, tool),
      tool,
      adminConsent: code === 'admin',
    };
  }
  const branche = providerOf(params.branche);
  if (!branche) return null;
  return {
    tone: 'success',
    text:
      locale === 'en'
        ? `${PROVIDER_LABELS[branche]} is connected. The first sync starts within a minute.`
        : `${PROVIDER_LABELS[branche]} est branché. La première synchronisation démarre dans la minute.`,
    tool: branche,
    adminConsent: false,
  };
}
