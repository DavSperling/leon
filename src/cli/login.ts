// `leon login` et `leon logout` (S05 du plan « CLI sans clone »).
//
// `leon login` : la CLI tire son jeton (il ne quitte jamais cet ordinateur que dans l'en-tête Authorization des
// requêtes qu'elle fait), n'en montre que l'empreinte au navigateur, écoute sur 127.0.0.1 le retour de la page
// d'autorisation de Leon (K3), échange le code signé qu'elle y reçoit contre l'enregistrement de son jeton (K5), puis
// écrit ~/.leon/connexion.json (K2) et révoque l'ancien jeton de cet ordinateur (K6). `--with-token` est le repli quand
// le navigateur n'est pas sur cet ordinateur : le jeton se crée dans Réglages et se colle ici. `leon logout` révoque
// le jeton (K6) et efface connexion.json.
//
// Le jeton, l'empreinte, le code et l'etat ne figurent dans aucun message, sauf l'adresse de K3 que la commande écrit
// une fois, pour qui n'a pas de navigateur qui s'ouvre. Toutes les dépendances viennent de leon.ts : les tests
// donnent un faux navigateur et un faux serveur.
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import {
  API_PATHS,
  API_TOKEN_PATTERN,
  ComputerResponseSchema,
  ViewerProfileSchema,
} from '../capture/api-contract';
import {
  type Connection,
  clearConnection,
  connectionPath,
  readConnection,
  writeConnection,
} from './connection';
import { isAllowedServerUrl } from './server-url';

// La CLI attend le retour du navigateur 5 minutes au plus (le code signé, lui, ne vit que 2 minutes).
const WAIT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const NAME_MAX_CHARS = 60; // la limite de K5 : au-delà, le serveur retient « ordinateur »
const LOOPBACK = 'http://127.0.0.1';

const UNREACHABLE =
  'Could not reach the server. Check the address and your network, then try again.';
const TRY_AGAIN = 'Run `leon login` to try again.';

export type LoginDeps = {
  home: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  open: (address: string) => void; // ouvre le navigateur (openInBrowser), ou le faux des tests
  hostname: string;
  out: (text: string) => void;
  err: (text: string) => void;
  readToken: () => Promise<string>; // --with-token : readTokenFromInput, ou le faux des tests
  timeoutMs?: number;
  signal?: AbortSignal; // Ctrl+C
};
export type LoginOptions = { url?: string; withToken?: boolean };

// Ouvre une adresse dans le navigateur de la personne : `open` (macOS) ou `xdg-open` (Linux). Une commande absente
// ou en échec ne gêne pas : l'adresse est aussi écrite dans le terminal.
export function openInBrowser(address: string): void {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [address], { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

// Le jeton collé par `--with-token` : une ligne de l'entrée, ou, sur un terminal, sans écho. Rend '' quand rien n'est lu.
export async function readTokenFromInput(
  input: NodeJS.ReadableStream & { isTTY?: boolean },
  output: NodeJS.WritableStream,
): Promise<string> {
  if (!input.isTTY) {
    const lines = createInterface({ input });
    const first = await lines[Symbol.asyncIterator]().next();
    lines.close();
    return first.done ? '' : first.value.trim();
  }
  output.write('Paste your Leon token (the input is hidden), then press Enter: ');
  // readline fait l'écho vers sa sortie : on lui donne un puits, la question est déjà posée ci-dessus.
  const sink = new Writable({ write: (_chunk, _encoding, done) => done() });
  const lines = createInterface({ input, output: sink, terminal: true });
  const line = await new Promise<string>((resolve) => {
    lines.once('close', () => resolve('')); // Ctrl+C ou fin de l'entrée
    lines.question('', resolve);
  });
  lines.close();
  output.write('\n');
  return line.trim();
}

// Le nom que le serveur retient (K5) : sans caractères de contrôle, 60 caractères au plus.
const computerName = (hostname: string) =>
  [...hostname.replace(/\p{Cc}/gu, '').trim()].slice(0, NAME_MAX_CHARS).join('') || 'ordinateur';

const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

// K6 avec ce jeton : vrai s'il est révoqué, ou déjà inconnu du serveur (401) ; faux si le serveur n'a pas répondu.
async function revokeToken(
  connection: Connection,
  deps: Pick<LoginDeps, 'fetch'>,
): Promise<boolean> {
  try {
    const response = await deps.fetch(new URL(API_PATHS.jeton, connection.url), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${connection.jeton}` },
      signal: timeout(),
    });
    return response.status === 204 || response.status === 401;
  } catch {
    return false;
  }
}

// Écrit la nouvelle connexion, puis révoque l'ancien jeton de cet ordinateur (jamais celui qu'on vient d'écrire).
async function saveConnection(
  next: Connection,
  previous: Connection | null,
  deps: LoginDeps,
): Promise<number> {
  try {
    await writeConnection(deps.home, next);
  } catch (error) {
    deps.err(
      `Could not save the connection: ${error instanceof Error ? error.message : 'write failed.'}`,
    );
    return 1;
  }
  deps.out(
    `Connected to ${next.espace} as ${next.ordinateur}. The connection is saved in ${connectionPath(deps.home)}.`,
  );
  if (previous && previous.jeton !== next.jeton && !(await revokeToken(previous, deps))) {
    deps.err(
      'Could not revoke the previous token of this computer (the server did not answer as expected): you can revoke it in Settings.',
    );
  }
  return 0;
}

// L'adresse du serveur : --url, sinon LEON_URL, sinon la connexion enregistrée (l'ordre de E5). On garde l'origine.
function serverUrl(
  options: LoginOptions,
  deps: LoginDeps,
  saved: Connection | null,
): string | null {
  const fromEnv = deps.env.LEON_URL || undefined;
  const given = options.url ?? fromEnv ?? saved?.url;
  if (given === undefined) {
    deps.err('No server address: pass --url https://<your Leon>, or set LEON_URL.');
    return null;
  }
  if (!isAllowedServerUrl(given)) {
    const source = options.url === undefined ? 'LEON_URL' : '--url';
    deps.err(`${source}: not a valid address (https, or http on localhost and 127.0.0.1).`);
    return null;
  }
  return new URL(given).origin;
}

type Outcome = { kind: 'code'; code: string } | { kind: 'refused' | 'timeout' | 'cancelled' };

const reply = (response: ServerResponse, status: number) =>
  response.writeHead(status, { Connection: 'close' }).end();

// Comparaison en temps constant ; la longueur de l'etat n'est pas un secret.
function sameSecret(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// L'écoute du retour : 127.0.0.1 seulement (jamais « localhost », jamais toutes les interfaces), un port choisi par le
// système, et une seule requête valable, `GET /retour` avec le bon etat. Tout le reste reçoit 404 ou 400 et l'écoute
// continue. Le navigateur repart vers la page « connecté » de Leon avant que l'écoute ne se ferme.
async function waitForBrowser(
  origin: string,
  etat: string,
  deps: LoginDeps,
  onListening: (port: number) => void,
): Promise<Outcome> {
  let settle: (outcome: Outcome) => void = () => {};
  const outcome = new Promise<Outcome>((resolve) => {
    settle = resolve;
  });
  const server = createServer((request, response) => {
    const target =
      request.url && URL.canParse(request.url, LOOPBACK) ? new URL(request.url, LOOPBACK) : null;
    if (request.method !== 'GET' || target?.pathname !== '/retour') return reply(response, 404);
    const code = target.searchParams.get('code');
    const refused = target.searchParams.get('refus') === '1';
    const result: Outcome | null = refused
      ? { kind: 'refused' }
      : code
        ? { kind: 'code', code }
        : null;
    if (!result || !sameSecret(target.searchParams.get('etat'), etat)) return reply(response, 400);
    response
      .writeHead(302, {
        Location: `${origin}/ordinateur/connecte${refused ? '?refus=1' : ''}`,
        Connection: 'close',
      })
      .end(() => settle(result));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException | null)?.code ?? 'error';
    throw new Error(
      `Could not listen on 127.0.0.1 (${reason}). Run \`leon login --with-token\` instead.`,
    );
  }
  const timer = setTimeout(() => settle({ kind: 'timeout' }), deps.timeoutMs ?? WAIT_MS);
  const cancel = () => settle({ kind: 'cancelled' });
  deps.signal?.addEventListener('abort', cancel, { once: true });
  if (deps.signal?.aborted) cancel();
  try {
    onListening((server.address() as AddressInfo).port);
    return await outcome;
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener('abort', cancel);
    server.close();
    server.closeAllConnections();
  }
}

// K5 : le code signé contre l'enregistrement du jeton, auquel seul celui qui le détient peut prétendre.
async function registerComputer(origin: string, token: string, code: string, deps: LoginDeps) {
  let response: Response;
  try {
    response = await deps.fetch(new URL(API_PATHS.ordinateurs, origin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, nom: computerName(deps.hostname) }),
      signal: AbortSignal.any([timeout(), ...(deps.signal ? [deps.signal] : [])]),
    });
  } catch {
    deps.err(deps.signal?.aborted ? 'Cancelled. Nothing was saved.' : UNREACHABLE);
    return null;
  }
  if (response.status === 201) {
    const body = ComputerResponseSchema.safeParse(await response.json().catch(() => null));
    if (body.success) return body.data;
    deps.err(`The server answered in an unexpected way. ${TRY_AGAIN}`);
    return null;
  }
  deps.err(
    response.status === 401
      ? `The server refused the authorization (it is valid once, for 2 minutes). ${TRY_AGAIN}`
      : response.status === 409
        ? `This authorization was already used. ${TRY_AGAIN}`
        : `The server could not register this computer (HTTP ${response.status}). ${TRY_AGAIN}`,
  );
  return null;
}

async function loginWithBrowser(
  origin: string,
  previous: Connection | null,
  deps: LoginDeps,
): Promise<number> {
  const token = `leon_${randomBytes(32).toString('base64url')}`;
  const etat = randomBytes(16).toString('base64url');
  const empreinte = createHash('sha256').update(token).digest('hex'); // comme hashApiToken, côté serveur
  const outcome = await waitForBrowser(origin, etat, deps, (port) => {
    const address = `${origin}/ordinateur/autoriser?${new URLSearchParams({ port: String(port), etat, empreinte })}`;
    deps.out('Opening your browser to authorize this computer. If it does not open, go to:');
    deps.out(`  ${address}`);
    deps.open(address);
    deps.out('If your browser is on another computer, run `leon login --with-token` instead.');
    deps.out(
      'If you had to create a space or reset your password on the way, run `leon login` again: those paths lose the authorization in progress.',
    );
    deps.out('Waiting for the browser (5 minutes at most). Press Ctrl+C to cancel.');
  });
  if (outcome.kind !== 'code') {
    deps.err(
      outcome.kind === 'refused'
        ? 'Authorization cancelled in the browser. Nothing was saved.'
        : outcome.kind === 'cancelled'
          ? 'Cancelled. Nothing was saved.'
          : `Timed out: the browser did not come back within 5 minutes. Nothing was saved. ${TRY_AGAIN}`,
    );
    return 1;
  }
  const registered = await registerComputer(origin, token, outcome.code, deps);
  if (!registered) return 1;
  return saveConnection(
    {
      url: origin,
      jeton: token,
      ordinateur: registered.ordinateur,
      espace: registered.espace,
      cree_le: new Date().toISOString(),
    },
    previous,
    deps,
  );
}

async function loginWithToken(
  origin: string,
  previous: Connection | null,
  deps: LoginDeps,
): Promise<number> {
  const token = (await deps.readToken()).trim();
  if (!API_TOKEN_PATTERN.test(token)) {
    deps.err('That is not a Leon token (it is shaped like leon_…). Create one in Settings.');
    return 1;
  }
  let response: Response;
  try {
    response = await deps.fetch(new URL(API_PATHS.me, origin), {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeout(),
    });
  } catch {
    deps.err(UNREACHABLE);
    return 1;
  }
  if (response.status === 401) {
    deps.err('The server refused this token: it may be revoked, or belong to another Leon.');
    return 1;
  }
  const profile = ViewerProfileSchema.safeParse(
    response.ok ? await response.json().catch(() => null) : null,
  );
  if (!profile.success) {
    deps.err(`The server answered in an unexpected way (HTTP ${response.status}).`);
    return 1;
  }
  return saveConnection(
    {
      url: origin,
      jeton: token,
      ordinateur: computerName(deps.hostname),
      espace: profile.data.organizationName,
      cree_le: new Date().toISOString(),
    },
    previous,
    deps,
  );
}

export async function runLogin(options: LoginOptions, deps: LoginDeps): Promise<number> {
  const previous = await readConnection(deps.home);
  const origin = serverUrl(options, deps, previous);
  if (origin === null) return 1;
  if (deps.env.LEON_URL && deps.env.LEON_TOKEN) {
    deps.err(
      'Note: LEON_URL and LEON_TOKEN are both set in your environment. They keep being used before the connection that leon login saves.',
    );
  }
  return options.withToken
    ? loginWithToken(origin, previous, deps)
    : loginWithBrowser(origin, previous, deps);
}

export async function runLogout(
  deps: Pick<LoginDeps, 'home' | 'env' | 'fetch' | 'out' | 'err'>,
): Promise<number> {
  const connection = await readConnection(deps.home);
  const revoked = connection ? await revokeToken(connection, deps) : true;
  const removed = await clearConnection(deps.home);
  const path = connectionPath(deps.home);
  if (connection) {
    if (revoked) {
      deps.out(`Signed out: the token of this computer was revoked and ${path} was removed.`);
    } else {
      deps.err(
        'Could not reach the server, or it did not answer as expected: the token of this computer was not revoked there. Revoke it in Settings.',
      );
      deps.out(`${path} was removed anyway.`);
    }
  } else {
    deps.out(removed ? `Removed ${path} (it was not a valid connection).` : 'Not connected.');
  }
  if (deps.env.LEON_URL && deps.env.LEON_TOKEN) {
    deps.err(
      'LEON_URL and LEON_TOKEN are both set in your environment: they still apply, and this command does not touch them.',
    );
  }
  return 0;
}
