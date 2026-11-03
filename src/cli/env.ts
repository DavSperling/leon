import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { API_TOKEN_PATTERN } from '../capture/api-contract';
import { readConnection } from './connection';
import { isAllowedServerUrl } from './server-url';

const ServerEnvSchema = z.object({
  LEON_URL: z.string().refine(isAllowedServerUrl),
  LEON_TOKEN: z.string().regex(API_TOKEN_PATTERN),
});

// Messages fixes : la valeur reçue (le jeton surtout) n'est jamais recopiée.
const HINTS = {
  LEON_URL: 'LEON_URL is missing or invalid (https, or http on localhost and 127.0.0.1).',
  LEON_TOKEN: 'LEON_TOKEN is missing or invalid (a token created in Leon, shaped like leon_…).',
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

// Le serveur et le jeton des commandes (E5 du plan « CLI sans clone ») : LEON_URL et LEON_TOKEN, si les deux sont
// posées, passent avant ~/.leon/connexion.json (les tests et le clone gardent leur réglage) ; sinon la connexion de
// `leon login` ; sinon l'erreur de parseServerEnv, qui dit aussi comment se connecter.
export async function resolveServerEnv(
  source: Record<string, string | undefined>,
  home: string,
): Promise<ServerEnv> {
  if (source.LEON_URL && source.LEON_TOKEN) return parseServerEnv(source);
  const connection = await readConnection(home);
  if (connection) return { url: connection.url, token: connection.jeton };
  try {
    return parseServerEnv(source);
  } catch (error) {
    const problem = error instanceof Error ? error.message : 'invalid configuration.';
    throw new Error(`${problem} This computer is not connected: run \`leon login\`.`);
  }
}

export function claudeConfigDir(source: Record<string, string | undefined>): string {
  return source.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}
