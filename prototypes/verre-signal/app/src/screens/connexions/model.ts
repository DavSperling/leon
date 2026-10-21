import { type Connection, CONNECTIONS, getProvider, ME, type Provider, PROVIDERS, type ProviderId } from '@/data';
import { formatDate, NOW } from '@/lib';

// Modèle local de l'écran Connexions : retours de l'éditeur, ordre des outils branchés, connexions créées, test d'une clé.

export const isProviderId = (v: string | null): v is ProviderId => !!v && PROVIDERS.some((p) => p.id === v);

// ---------- Retour de l'éditeur (?retour=<code>&outil=<id>), textes du vrai Leon (lib/connection-form.ts) ----------
export const RETURN_CODES = ['ok', 'annule', 'expire', 'refuse', 'indisponible', 'champs', 'admin', 'admin_accorde', 'autre_compte'] as const;
export type ReturnCode = (typeof RETURN_CODES)[number];
export type ReturnNotice = { tone: 'success' | 'error'; text: string; admin: boolean };

export const ADMIN_CONSENT = 'L’administrateur Microsoft de votre entreprise doit d’abord autoriser Leon.';
// shortcut: lien d'accord fictif (doc Microsoft) ; le vrai vient du catalogue serveur (adminConsentUrl).
export const ADMIN_CONSENT_URL = 'https://learn.microsoft.com/fr-fr/entra/identity/enterprise-apps/grant-admin-consent';

/** Le message du retour, ou null (code inconnu ; `ok` sans outil connu). Rien de l'adresse n'est repris tel quel. */
export function returnNotice(code: string | null, tool: string | null): ReturnNotice | null {
  const id = isProviderId(tool) ? tool : null;
  const label = id ? getProvider(id).label : null;
  const subject = label ?? 'L’outil';
  const object = label ?? 'l’outil';
  const err = (text: string): ReturnNotice => ({ tone: 'error', text, admin: false });
  switch (code) {
    case 'ok': return label ? { tone: 'success', text: `${label} est branché. La première synchronisation démarre dans la minute.`, admin: false } : null;
    case 'annule': return err(`Connexion à ${object} annulée.`);
    case 'expire': return err('Le lien a expiré, recommencez.');
    case 'refuse': return err(`${subject} a refusé l’autorisation.`);
    case 'indisponible': return err(`${subject} ne répond pas, réessayez dans un moment.`);
    case 'champs': return err('Vérifiez les champs saisis.');
    case 'admin': return { tone: 'error', text: ADMIN_CONSENT, admin: true };
    case 'admin_accorde': return { tone: 'success', text: 'Accord donné : cliquez de nouveau sur Se connecter avec Outlook.', admin: false };
    case 'autre_compte': return err(`Reconnectez ${object} avec le même compte et le même site, ou ajoutez une autre connexion.`);
    default: return null;
  }
}

// ---------- Outils branchés : les problèmes d'abord ----------
const rank = (c: Connection) => (c.creatorLeft || c.status === 'error' ? 0 : c.status === 'paused' ? 1 : 2);
/** Les outils qui ont au moins une connexion : les problèmes d'abord (en erreur, arrêtée), puis en pause, puis l'ordre du catalogue. */
export const connectedTools = (conns: Connection[]): Provider[] =>
  PROVIDERS.map((p) => ({ p, r: Math.min(...conns.filter((c) => c.provider === p.id).map(rank)) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.p);

const list = new Intl.ListFormat('fr', { type: 'conjunction' });
/** « Déjà branché par Alice et Bob. », calculé sur l'état local (une suppression le met à jour). */
export function othersNote(conns: Connection[]): string | null {
  const names = [...new Map(conns.filter((c) => c.createdBy.id !== ME.id).map((c) => [c.createdBy.id, c.createdBy.firstName])).values()];
  return names.length ? `Déjà branché par ${list.format(names)}.` : null;
}

/** Champs demandés avant le clic OAuth (catalogue serveur du vrai Leon : `oauthPreFields`). */
export const OAUTH_PRE_FIELDS: Partial<Record<ProviderId, string[]>> = {
  github: ['repos'], asana: ['workspace'], jira: ['site'], confluence: ['site'], airtable: ['bases'], gitlab: ['projects'],
};

/** « Clé ••••abcd · branché par Julie le 12 oct. 2026 » (« Jeton » pour OAuth), toujours avec la date, même aujourd'hui. */
export const secretText = (c: Connection): string =>
  `${c.via === 'oauth' ? 'Jeton' : 'Clé'} ••••${c.secretHint} · branché par ${c.createdBy.firstName} le ${formatDate(c.createdAt)}`;

// ---------- Connexions créées pendant la démo ----------
let seq = 0;
const HINTS = ['q7Xe', 'm2Rv', 'w9Kd', 't4Hb', 'z6Nc'];
export const accountFor = (provider: ProviderId): string => (provider === 'outlook' ? ME.email : `Acme (${getProvider(provider).label})`);
export const hintOf = (secret: string): string => secret.replace(/\s+/g, '').slice(-4) || HINTS[0]!;

export function newConnection(provider: ProviderId, via: 'oauth' | 'key', secret?: string): Connection {
  seq += 1;
  return {
    id: `cx-nouv-${provider}-${seq}`, provider, account: accountFor(provider), status: 'active', via, createdBy: ME, createdAt: NOW,
    lastSyncAt: null, itemsSynced: 0, secretHint: via === 'key' && secret ? hintOf(secret) : HINTS[seq % HINTS.length]!,
  };
}

/** Test simulé d'une clé : un secret vide est refusé par le formulaire, une clé qui contient « faux » par l'outil. */
export function testKey(provider: ProviderId, values: Record<string, string>, onlySecrets = false): { ok: true } | { error: string } {
  const p = getProvider(provider);
  const fields = onlySecrets ? p.fields.filter((f) => f.kind === 'secret') : p.fields;
  const missing = fields.filter((f) => f.kind === 'secret' && !values[f.name]?.trim());
  if (missing.length) return { error: `Vérifiez les champs : ${missing.map((f) => f.label).join(', ')}` };
  if (Object.values(values).some((v) => /faux/i.test(v))) return { error: `Clé refusée par ${p.label}.` };
  return { ok: true };
}

console.assert(
  returnNotice('ok', 'github')?.text === 'GitHub est branché. La première synchronisation démarre dans la minute.' &&
    returnNotice('annule', null)?.text === 'Connexion à l’outil annulée.' && returnNotice('ok', 'xyz') === null && returnNotice('zzz', 'github') === null &&
    'error' in testKey('github', { token: 'github_pat_faux', repos: '' }) && 'ok' in testKey('github', { token: 'github_pat_1234', repos: '' }) &&
    (testKey('github', { token: ' ', repos: '' }) as { error: string }).error === 'Vérifiez les champs : Jeton d’accès à grain fin',
  'connexions/model.ts : retours ou test de clé incorrects',
);
console.assert(
  connectedTools(CONNECTIONS).map((p) => p.id).join() === 'jira,intercom,hubspot,github,linear,notion,claap,fathom,granola,outlook',
  'connexions/model.ts : ordre des outils branchés',
);
