import { formatDate, formatNumber, formatSince, minutesAgo, paris } from '@/lib/format';
import { nb } from '@/lib/nb';
import { ALICE, BOB, JULIE, ME, type Person, PIERRE, THOMAS } from './people';
import { getProvider, type ProviderId } from './providers';

// État des connexions d'Acme : 7 outils actifs, HubSpot en pause, Intercom en erreur, Jira arrêtée (créateur parti).

export type ConnectionStatus = 'active' | 'paused' | 'error';
export type Connection = {
  id: string;
  provider: ProviderId;
  /** Libellé du compte : « Julie Martin (acme) », « Compte HubSpot 123456 » */
  account: string;
  status: ConnectionStatus;
  via: 'oauth' | 'key';
  createdBy: Person;
  createdAt: Date;
  lastSyncAt: Date | null;
  itemsSynced: number;
  lastError?: string;
  creatorLeft?: boolean;
  /** Quatre derniers caractères de la clé ou du jeton */
  secretHint: string;
};

const c = (id: string, provider: ProviderId, account: string, status: ConnectionStatus, via: 'oauth' | 'key', createdBy: Person, createdAt: string, lastSyncAt: Date | null, itemsSynced: number, secretHint: string, extra: Partial<Connection> = {}): Connection =>
  ({ id, provider, account, status, via, createdBy, createdAt: paris(createdAt), lastSyncAt, itemsSynced, secretHint, ...extra });

export const CONNECTIONS: Connection[] = [
  c('cx-github', 'github', 'Julie Martin (acme)', 'active', 'key', JULIE, '2026-09-02 10:12', minutesAgo(125), 1234, 'x7Qa'),
  c('cx-linear', 'linear', 'Acme (Linear)', 'active', 'oauth', ME, '2026-09-02 10:30', minutesAgo(18), 418, 'k2Lm'),
  c('cx-notion-alice', 'notion', 'Notion (espace Acme)', 'active', 'oauth', ALICE, '2026-09-05 14:00', minutesAgo(64), 305, 'n0Ta'),
  c('cx-notion-bob', 'notion', 'Notion (espace Produit)', 'active', 'key', BOB, '2026-09-29 09:40', minutesAgo(190), 96, 'p9Rd'),
  c('cx-fathom', 'fathom', 'Julie Martin (Fathom)', 'active', 'key', JULIE, '2026-09-10 16:20', minutesAgo(41), 62, 'f4Th'),
  c('cx-claap', 'claap', 'Claap (espace Acme)', 'active', 'key', BOB, '2026-09-18 11:00', minutesAgo(300), 41, 'c1Ap'),
  c('cx-granola', 'granola', '12 réunions accessibles', 'active', 'key', THOMAS, '2026-10-21 10:40', null, 0, 'g8Rn'),
  c('cx-outlook', 'outlook', 'david@acme.fr', 'active', 'oauth', ME, '2026-09-03 09:00', minutesAgo(6), 583, 'o3Lk'),
  c('cx-hubspot', 'hubspot', 'Compte HubSpot 123456', 'paused', 'oauth', JULIE, '2026-09-08 15:00', paris('2026-10-12 08:00'), 237, 'h5Sp'),
  c('cx-intercom', 'intercom', 'Acme Support (Intercom)', 'error', 'key', BOB, '2026-09-15 10:00', paris('2026-10-19 07:30'), 154, 'abcd', { lastError: 'Clé refusée par Intercom.' }),
  c('cx-jira', 'jira', 'Pierre Garnier (acme)', 'active', 'oauth', PIERRE, '2026-08-28 09:00', paris('2026-09-28 06:00'), 1230, 'j1Ra', { creatorLeft: true }),
];

export const connectionsOf = (provider: ProviderId): Connection[] => CONNECTIONS.filter((x) => x.provider === provider);

/** Outils avec au moins une connexion active qui tourne (« 7 outils branchés »). */
export const ACTIVE_TOOL_COUNT = new Set(CONNECTIONS.filter((x) => x.status === 'active' && !x.creatorLeft).map((x) => x.provider)).size;

/** Ligne d'état, copie exacte : « Actif · dernier passage il y a 2 h · 1 234 éléments », « En pause », « En erreur : … », « Arrêtée : … n'est plus membre ». */
export function statusLine(x: Connection): string {
  if (x.creatorLeft) return `Arrêtée : ${x.createdBy.name} n’est plus membre`;
  if (x.status === 'paused') return 'En pause';
  if (x.status === 'error') return nb(x.lastError ? `En erreur : ${x.lastError}` : 'En erreur');
  if (!x.lastSyncAt) return 'Actif · premier passage en attente';
  return `Actif · dernier passage ${formatSince(x.lastSyncAt)} · ${formatNumber(x.itemsSynced)} ${x.itemsSynced > 1 ? 'éléments' : 'élément'}`;
}

/** Ton de la ligne d'état (icône CircleCheck / Pause / CircleX). */
export const statusTone = (x: Connection): 'success' | 'muted' | 'destructive' =>
  x.creatorLeft || x.status === 'error' ? 'destructive' : x.status === 'paused' ? 'muted' : 'success';

const list = new Intl.ListFormat('fr', { type: 'conjunction' });
/** Les autres membres qui ont branché cet outil. */
export const otherOwners = (provider: ProviderId, viewer: Person = ME): Person[] =>
  [...new Map(connectionsOf(provider).filter((x) => x.createdBy.id !== viewer.id).map((x) => [x.createdBy.id, x.createdBy])).values()];
/** « Déjà branché par Alice et Bob. » ou null. */
export function otherOwnersNote(provider: ProviderId, viewer: Person = ME): string | null {
  const names = otherOwners(provider, viewer).map((p) => p.firstName);
  return names.length ? `Déjà branché par ${list.format(names)}.` : null;
}

/** « Clé ••••abcd · branché par Julie le 12 oct. 2026 » (« Jeton » pour OAuth), toujours la date, copie exacte. */
export const secretLine = (x: Connection): string =>
  `${x.via === 'oauth' ? 'Jeton' : 'Clé'} ••••${x.secretHint} · branché par ${x.createdBy.firstName} le ${formatDate(x.createdAt)}`;

/** Description de la fenêtre d'un outil. */
export const dialogDescription = (provider: ProviderId): string => `Ce que Leon lit dans ${getProvider(provider).label} est visible de toute l’équipe.`;

/** Périodes du premier passage (« Lire ce qui date de »). */
export const BACKFILL_OPTIONS = [
  { value: '7', label: '7 derniers jours' },
  { value: '30', label: '30 derniers jours' },
  { value: '90', label: '90 derniers jours' },
  { value: '365', label: '1 an' },
];
export const BACKFILL_DEFAULT = '30';
