import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { API_TOKEN_PATTERN } from '../capture/api-contract';

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

// On compare le nom d'hôte calculé par URL, jamais un préfixe de chaîne :
// « http://localhost:3000@evil.example » a pour hôte evil.example.
function isAllowedServerUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOCAL_HOSTNAMES.includes(url.hostname))
  );
}

const ServerEnvSchema = z.object({
  LEON_URL: z.string().refine(isAllowedServerUrl),
  LEON_TOKEN: z.string().regex(API_TOKEN_PATTERN),
});

// Messages fixes : la valeur reçue (le jeton surtout) n'est jamais recopiée.
const HINTS = {
  LEON_URL: 'LEON_URL manquante ou invalide (https, ou http sur localhost et 127.0.0.1).',
  LEON_TOKEN: 'LEON_TOKEN manquant ou invalide (jeton créé dans Leon, de la forme leon_…).',
};

export type ServerEnv = { url: string; token: string };

// Une variable vide échoue comme une variable absente. Seul l'envoi réel en a besoin.
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = ServerEnvSchema.safeParse(source);
  if (!result.success) {
    const names = new Set(result.error.issues.map((issue) => issue.path[0] as keyof typeof HINTS));
    throw new Error([...names].map((name) => HINTS[name]).join(' '));
  }
  return { url: result.data.LEON_URL, token: result.data.LEON_TOKEN };
}

export function claudeConfigDir(source: Record<string, string | undefined>): string {
  return source.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}
