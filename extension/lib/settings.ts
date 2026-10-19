import { z } from 'zod';
import { SITES, type Site } from './exchange';

export const SETTINGS_KEY = 'leon.settings';
export const STATUS_KEY = 'leon.status';

// Version du texte de l'écran de consentement (entrypoints/options/index.html, section #consent). Un accord ne vaut
// que pour le texte qu'on a lu : donné sur une version plus ancienne, il ne permet plus de capter, et l'écran se
// réaffiche jusqu'au nouvel accord. 1 : premier jet (analyse par l'API d'Anthropic pour en extraire des faits) ;
// 2 : deuxième jet (le serveur garde et indexe la conversation, et peut envoyer des passages au fournisseur du
// modèle d'IA pour répondre aux questions). Un réglage enregistré avant les versions vaut 0.
// consent-version.test.ts lie le texte à cette version : changer le texte impose de la monter.
export const CONSENT_VERSION = 2;

export type KeyValueStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

const SettingsSchema = z.object({
  token: z.string().nullable().default(null),
  consentAt: z.string().nullable().default(null),
  consentVersion: z.number().int().nonnegative().default(0),
  sites: z.object({ claude_ai: z.boolean(), chatgpt: z.boolean() }).default({
    claude_ai: true,
    chatgpt: true,
  }),
  paused: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

const CONNECTIONS = [
  'connected',
  'not_configured',
  'unauthorized',
  'unreachable',
  'unknown',
] as const;

const StatusSchema = z.object({
  lastCaptureAt: z.partialRecord(z.enum(SITES), z.string()).default({}),
  connection: z.enum(CONNECTIONS).default('unknown'),
  pending: z.number().int().default(0),
});
export type CaptureStatus = z.infer<typeof StatusSchema>;

// Les données viennent du stockage du navigateur : on les relit par le schéma, jamais à l'aveugle.
export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  return SettingsSchema.parse((await store.get(SETTINGS_KEY)) ?? {});
}

export async function saveSettings(
  store: KeyValueStore,
  patch: Partial<Settings>,
): Promise<Settings> {
  const settings = { ...(await loadSettings(store)), ...patch };
  await store.set(SETTINGS_KEY, settings);
  return settings;
}

// L'accord donné sur le texte actuel de l'écran de consentement (ou sur un plus récent).
export function hasConsent(settings: Settings): boolean {
  return settings.consentAt !== null && settings.consentVersion >= CONSENT_VERSION;
}

export function canCapture(settings: Settings, site: Site): boolean {
  return hasConsent(settings) && !settings.paused && settings.sites[site];
}

export async function loadStatus(store: KeyValueStore): Promise<CaptureStatus> {
  return StatusSchema.parse((await store.get(STATUS_KEY)) ?? {});
}

export async function saveStatus(
  store: KeyValueStore,
  patch: Partial<CaptureStatus>,
): Promise<void> {
  await store.set(STATUS_KEY, { ...(await loadStatus(store)), ...patch });
}
