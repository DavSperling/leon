import { z } from 'zod';
import { SITES, type Site } from './exchange';

export const SETTINGS_KEY = 'leon.settings';
export const STATUS_KEY = 'leon.status';

export type KeyValueStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

const SettingsSchema = z.object({
  token: z.string().nullable().default(null),
  consentAt: z.string().nullable().default(null),
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

export function canCapture(settings: Settings, site: Site): boolean {
  return settings.consentAt !== null && !settings.paused && settings.sites[site];
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
