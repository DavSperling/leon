import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installerScript, ManifestError } from '@/server/cli/installer-script';
import { env } from '@/server/env';
import { logError } from '@/server/log';

// GET /install : le script que lance `curl -fsSL <leon>/install | sh` (S09 du plan « CLI sans clone »). Public, sans
// session : il ne porte que l'adresse du serveur et des empreintes, rien de secret. Il est fabriqué à chaque requête
// (BETTER_AUTH_URL et le manifeste public/cli/version.json que `pnpm build` écrit à chaque déploiement).
//
// Une erreur répond 5xx : `curl -f` n'en affiche pas le corps, et `sh` ne reçoit jamais autre chose qu'un script.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

export async function GET(): Promise<Response> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      await readFile(join(process.cwd(), 'public', 'cli', 'version.json'), 'utf8'),
    );
  } catch (error) {
    logError('install.manifest', error);
    return text('The Leon command line is not available on this server yet.\n', 503);
  }
  try {
    return text(installerScript(env.BETTER_AUTH_URL, manifest), 200);
  } catch (error) {
    // Un manifeste (503, la CLI n'est pas prête) ou une adresse (500, mal réglée) qui n'a pas la forme attendue : le
    // message de l'erreur est fixe, il ne recopie rien.
    logError('install.script', error);
    return error instanceof ManifestError
      ? text('The Leon command line is not available on this server yet.\n', 503)
      : text('The installer is not set up on this server (see the server logs).\n', 500);
  }
}
