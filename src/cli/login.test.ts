import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, API_TOKEN_PATTERN } from '../capture/api-contract';
import { authorizePath, parseAuthorizeParams, returnUrl } from '../server/auth/computer-authorize';
import { connectionPath, readConnection, writeConnection } from './connection';
import { type LoginDeps, parseLoginArgs, readTokenFromInput, runLogin, runLogout } from './login';

// `leon login` et `leon logout` contre un faux serveur de Leon et un faux navigateur, tous deux sur 127.0.0.1. Ces
// tests ouvrent des ports : hors de la sandbox. La connexion s'écrit toujours dans un HOME temporaire.

const OLD_TOKEN = `leon_${'o'.repeat(43)}`;
const HOSTNAME = 'Test-Mac';

type Call = {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
  // connexion.json au moment de l'appel : prouve l'ordre « écrire, puis révoquer l'ancien jeton ».
  saved: string | null;
};

type FakeLeon = { url: string; calls: Call[]; close: () => Promise<void> };

async function bodyOf(request: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of request) text += chunk;
  return text;
}

// Le faux Leon : K5 (POST /api/v1/ordinateurs), K6 (DELETE /api/v1/jeton) et /api/v1/me.
async function startLeon(
  home: string,
  answers: {
    register?: number;
    me?: number;
    revoke?: number;
    espace?: string;
    compte?: string;
  } = {},
): Promise<FakeLeon> {
  const calls: Call[] = [];
  const server: Server = createServer(async (request, response) => {
    const text = await bodyOf(request);
    calls.push({
      method: request.method ?? '',
      path: request.url ?? '',
      authorization: request.headers.authorization,
      body: text ? JSON.parse(text) : undefined,
      saved: await readFile(connectionPath(home), 'utf8').catch(() => null),
    });
    const json = (status: number, body: unknown) =>
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (request.method === 'POST' && request.url === API_PATHS.ordinateurs) {
      const status = answers.register ?? 201;
      const { nom } = JSON.parse(text) as { nom: string };
      return status === 201
        ? json(201, {
            espace: answers.espace ?? 'Acme',
            ordinateur: nom,
            compte: answers.compte ?? 'paul@example.com',
          })
        : json(status, {});
    }
    if (request.method === 'DELETE' && request.url === API_PATHS.jeton) {
      return answers.revoke === undefined || answers.revoke === 204
        ? response.writeHead(204).end()
        : json(answers.revoke, {});
    }
    if (request.method === 'GET' && request.url === API_PATHS.me) {
      return (answers.me ?? 200) === 200
        ? json(200, {
            userId: crypto.randomUUID(),
            tenantId: crypto.randomUUID(),
            userName: 'Paul',
            email: answers.compte ?? 'paul@example.com',
            organizationName: answers.espace ?? 'Acme',
          })
        : json(answers.me ?? 401, {});
    }
    return json(404, {});
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

// Ce que le faux navigateur lit dans l'adresse que la CLI ouvre (K3).
function authorizeParams(address: string) {
  const url = new URL(address);
  return {
    origin: url.origin,
    path: url.pathname,
    port: Number(url.searchParams.get('port')),
    etat: url.searchParams.get('etat') ?? '',
    empreinte: url.searchParams.get('empreinte') ?? '',
    keys: [...url.searchParams.keys()].sort(),
  };
}
type Params = ReturnType<typeof authorizeParams>;

// Le navigateur qui revient vers la CLI, sans suivre la redirection : on lit ce que la CLI répond.
const comeBack = (params: Params, query: Record<string, string>, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${params.port}/retour?${new URLSearchParams(query)}`, {
    redirect: 'manual',
    ...init,
  });

const approve = (params: Params, code = 'charge.signature') =>
  comeBack(params, { code, etat: params.etat });

// Un caractère de contrôle (hors le saut de ligne qui sépare les messages) : le terminal l'interpréterait.
const hasControl = (text: string) => /\p{Cc}/u.test(text.replaceAll('\n', ''));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const tokenOf = (call: Call | undefined) => call?.authorization?.replace('Bearer ', '') ?? '';
const registerCall = (leon: FakeLeon) => leon.calls.find((call) => call.method === 'POST');

let home: string;
let leon: FakeLeon;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'leon-login-'));
  leon = await startLeon(home);
});
afterEach(async () => {
  await leon.close();
  await rm(home, { recursive: true, force: true });
});

// `visit` : ce que fait le navigateur quand la CLI l'ouvre (rien du tout par défaut : l'utilisateur ne revient pas).
function setup(
  visit: (params: Params, address: string) => Promise<unknown> = async () => {},
  overrides: Partial<LoginDeps> = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const timeline: string[] = []; // 'open' et chaque message de la sortie, dans l'ordre
  const browsing: Promise<unknown>[] = [];
  const deps: LoginDeps = {
    home,
    env: { LEON_URL: leon.url },
    fetch,
    open: (address) => {
      opened.push(address);
      timeline.push('open');
      browsing.push(visit(authorizeParams(address), address));
    },
    hostname: HOSTNAME,
    out: (text) => {
      out.push(text);
      timeline.push(text);
    },
    err: (text) => err.push(text),
    readToken: async () => '',
    timeoutMs: 5000,
    ...overrides,
  };
  return {
    deps,
    out,
    err,
    opened,
    timeline,
    everything: () => [...out, ...err].join('\n'),
    browsed: () => Promise.all(browsing),
  };
}

describe('leon login : le parcours par le navigateur', () => {
  it('ouvre la page d’autorisation, reçoit le code, l’échange et écrit connexion.json', async () => {
    let seen: Params | undefined;
    let back: Response | undefined;
    const run = setup(async (params) => {
      seen = params;
      back = await approve(params, 'le.code');
    });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(0);
    // K3 : l'adresse ouverte, avec le port, l'etat et l'empreinte, et rien d'autre.
    expect(run.opened).toHaveLength(1);
    expect(seen?.origin).toBe(leon.url);
    expect(seen?.path).toBe('/ordinateur/autoriser');
    expect(seen?.keys).toEqual(['empreinte', 'etat', 'port']);
    expect(seen?.port).toBeGreaterThanOrEqual(1024);
    expect(seen?.etat).toMatch(/^[A-Za-z0-9_-]{22,64}$/);
    expect(seen?.empreinte).toMatch(/^[0-9a-f]{64}$/);
    // Le navigateur est renvoyé vers la page « connecté » de Leon, et l'écoute est fermée.
    expect(back?.status).toBe(302);
    expect(back?.headers.get('Location')).toBe(`${leon.url}/ordinateur/connecte`);
    await expect(approve(seen as Params)).rejects.toThrow();
    // K5 : le jeton de la CLI dans l'en-tête, le code et le nom de la machine dans le corps.
    const register = registerCall(leon);
    const token = tokenOf(register);
    expect(token).toMatch(API_TOKEN_PATTERN);
    expect(sha256(token)).toBe(seen?.empreinte);
    expect(register?.body).toEqual({ code: 'le.code', nom: HOSTNAME });
    // K2 : ce que le serveur a répondu, le jeton tiré, en 0600.
    const saved = await readConnection(home);
    expect(saved).toMatchObject({
      url: leon.url,
      jeton: token,
      ordinateur: HOSTNAME,
      espace: 'Acme',
    });
    expect(new Date(saved?.cree_le ?? '').toISOString()).toBe(saved?.cree_le);
    expect((await stat(connectionPath(home))).mode & 0o777).toBe(0o600);
    // Le compte autorisé est affiché : sur une machine partagée, c'est ce qui trahit une autorisation donnée par un autre.
    expect(run.out.join('\n')).toContain(
      `Connected to Acme as paul@example.com (this computer: ${HOSTNAME})`,
    );
  });

  it('retire les caractères de contrôle de l’espace et du compte, à l’écran et dans connexion.json', async () => {
    await leon.close();
    // Un nom d'espace choisi par un tiers : séquences d'échappement du terminal, retour chariot.
    leon = await startLeon(home, {
      espace: 'Ac\u001b[2Jme\r\u0007',
      compte: 'pa\u001b]0;x\u0007ul@example.com\u0085',
    });
    const run = setup(async (params) => void (await approve(params)), {
      env: { LEON_URL: leon.url },
    });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();

    expect(run.out.join('\n')).toContain(
      `Connected to Ac[2Jme as pa]0;xul@example.com (this computer: ${HOSTNAME})`,
    );
    expect(hasControl(run.everything())).toBe(false);
    expect((await readConnection(home))?.espace).toBe('Ac[2Jme');
  });

  it('écoute sur 127.0.0.1 seulement, pas sur toutes les interfaces', async () => {
    const run = setup(async (params) => {
      // Une écoute sur « :: » ou « localhost » répondrait aussi en IPv6.
      const viaIpv6 = await fetch(`http://[::1]:${params.port}/retour`).then(
        () => true,
        () => false,
      );
      expect(viaIpv6).toBe(false);
      await approve(params);
    });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();
  });

  it('après l’ouverture, dit quoi faire si le navigateur est ailleurs ou si l’autorisation en cours est perdue', async () => {
    const run = setup((params) => approve(params));

    await runLogin({}, run.deps);
    await run.browsed();

    const text = run.out.join('\n');
    expect(text).toMatch(/another computer.*leon login --with-token/s);
    expect(text).toMatch(/create a space or reset your password.*leon login/s);
    // Les deux phrases viennent après l'ouverture du navigateur.
    const opening = run.timeline.indexOf('open');
    const help = run.timeline.findIndex((line) => /--with-token/.test(line));
    expect(opening).toBeGreaterThanOrEqual(0);
    expect(help).toBeGreaterThan(opening);
    // L'adresse est aussi écrite, pour qui n’a pas de navigateur qui s’ouvre.
    expect(text).toContain(run.opened[0] as string);
  });

  it('un etat faux est refusé, et l’écoute reste ouverte jusqu’au bon', async () => {
    const statuses: number[] = [];
    const run = setup(async (params) => {
      for (const etat of ['faux', params.etat.slice(0, -1), `${params.etat}x`]) {
        statuses.push((await comeBack(params, { code: 'pirate', etat })).status);
      }
      statuses.push((await comeBack(params, { code: 'pirate' })).status);
      await approve(params, 'bon.code');
    });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(0);
    expect(statuses).toEqual([400, 400, 400, 400]);
    expect(registerCall(leon)?.body).toMatchObject({ code: 'bon.code' });
  });

  it('un refus n’écrit rien et n’appelle pas le serveur', async () => {
    let back: Response | undefined;
    const run = setup(async (params) => {
      back = await comeBack(params, { refus: '1', etat: params.etat });
    });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(1);
    expect(back?.status).toBe(302);
    expect(back?.headers.get('Location')).toBe(`${leon.url}/ordinateur/connecte?refus=1`);
    expect(await readConnection(home)).toBeNull();
    expect(leon.calls).toEqual([]);
    expect(run.err.join('\n')).toMatch(/cancelled|refused|declined/i);
  });

  it('un refus avec un etat faux ne compte pas', async () => {
    const run = setup(async (params) => {
      expect((await comeBack(params, { refus: '1', etat: 'faux' })).status).toBe(400);
      await approve(params);
    });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();
  });

  it('au bout du délai, n’écrit rien et ferme l’écoute', async () => {
    const run = setup(async () => {}, { timeoutMs: 100 });

    const code = await runLogin({}, run.deps);

    expect(code).toBe(1);
    expect(await readConnection(home)).toBeNull();
    expect(leon.calls).toEqual([]);
    expect(run.err.join('\n')).toMatch(/timed out|no answer/i);
  });

  it('sur Ctrl+C, n’écrit rien et ferme l’écoute', async () => {
    const abort = new AbortController();
    let seen: Params | undefined;
    const run = setup(
      async (params) => {
        seen = params;
        setTimeout(() => abort.abort(), 20);
      },
      { signal: abort.signal },
    );

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(1);
    expect(await readConnection(home)).toBeNull();
    expect(leon.calls).toEqual([]);
    await expect(approve(seen as Params)).rejects.toThrow();
  });

  it('une requête qui n’est pas GET /retour reçoit 404, et l’écoute continue', async () => {
    const statuses: number[] = [];
    const run = setup(async (params) => {
      const base = `http://127.0.0.1:${params.port}`;
      statuses.push((await fetch(`${base}/`)).status);
      statuses.push((await fetch(`${base}/favicon.ico`)).status);
      statuses.push((await fetch(`${base}/retour/autre?etat=${params.etat}`)).status);
      statuses.push(
        (await fetch(`${base}/retour?code=x&etat=${params.etat}`, { method: 'POST', body: '{}' }))
          .status,
      );
      statuses.push(
        (await fetch(`${base}/retour?code=x&etat=${params.etat}`, { method: 'HEAD' })).status,
      );
      await approve(params);
    });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();

    expect(statuses).toEqual([404, 404, 404, 404, 404]);
  });

  it('K5 refuse (401), ou ne répond pas : un message, rien d’écrit', async () => {
    for (const register of [401, 409, 500]) {
      await leon.close();
      leon = await startLeon(home, { register });
      const run = setup((params) => approve(params), { env: { LEON_URL: leon.url } });

      const code = await runLogin({}, run.deps);
      await run.browsed();

      expect(code).toBe(1);
      expect(await readConnection(home)).toBeNull();
      expect(run.err.join('\n')).toMatch(/leon login/);
    }

    const down = setup((params) => approve(params), {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(await runLogin({}, down.deps)).toBe(1);
    await down.browsed();
    expect(await readConnection(home)).toBeNull();
    expect(down.err.join('\n')).toMatch(/could not reach/i);
  });

  it('un code absent du retour est refusé comme un etat faux', async () => {
    let status = 0;
    const run = setup(async (params) => {
      status = (await comeBack(params, { etat: params.etat })).status;
      await approve(params);
    });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();
    expect(status).toBe(400);
  });
});

// Contrat entre la CLI et la page d'autorisation, chacune de son côté du navigateur : l'adresse ouverte par la CLI doit
// passer la règle de la page (parseAuthorizeParams), et le retour bâti par la page (returnUrl) doit être reçu par la CLI.
// Le faux navigateur des autres tests bâtit son retour lui-même : sans ceux-ci, les deux côtés pourraient diverger.
describe('leon login : le contrat avec la page d’autorisation', () => {
  const pageParams = (address: string) =>
    parseAuthorizeParams(Object.fromEntries(new URL(address).searchParams));

  it('ouvre une adresse que la page accepte, et reçoit le code de son retour', async () => {
    let back: Response | undefined;
    const run = setup(async (_params, address) => {
      const params = pageParams(address);
      if (!params) throw new Error('adresse refusée par la page d’autorisation');
      expect(new URL(address).pathname).toBe(new URL(authorizePath(params), leon.url).pathname);
      back = await fetch(returnUrl(params, { code: 'le.code' }), { redirect: 'manual' });
    });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(0);
    expect(back?.headers.get('Location')).toBe(`${leon.url}/ordinateur/connecte`);
    expect(registerCall(leon)?.body).toMatchObject({ code: 'le.code' });
  });

  it('comprend le refus que la page renvoie', async () => {
    const run = setup(async (_params, address) => {
      const params = pageParams(address);
      if (!params) throw new Error('adresse refusée par la page d’autorisation');
      await fetch(returnUrl(params, 'refus'), { redirect: 'manual' });
    });

    expect(await runLogin({}, run.deps)).toBe(1);
    await run.browsed();
    expect(await readConnection(home)).toBeNull();
    expect(leon.calls).toEqual([]);
  });
});

describe('leon login : l’ancien jeton', () => {
  const previous = (url: string) => ({
    url,
    jeton: OLD_TOKEN,
    ordinateur: 'Ancien',
    espace: 'Acme',
    cree_le: '2026-10-01T10:00:00.000Z',
  });

  it('est révoqué (K6) après l’écriture du nouveau', async () => {
    await writeConnection(home, previous(leon.url));
    const run = setup((params) => approve(params), { env: {} });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(0);
    const revoke = leon.calls.find((call) => call.method === 'DELETE');
    expect(revoke?.path).toBe(API_PATHS.jeton);
    expect(tokenOf(revoke)).toBe(OLD_TOKEN);
    // Au moment de la révocation, connexion.json portait déjà le nouveau jeton.
    const newToken = tokenOf(registerCall(leon));
    expect(JSON.parse(revoke?.saved ?? '{}').jeton).toBe(newToken);
    expect((await readConnection(home))?.jeton).toBe(newToken);
  });

  it('qu’on ne peut pas révoquer ne défait pas la connexion : un avertissement', async () => {
    await leon.close();
    leon = await startLeon(home, { revoke: 500 });
    await writeConnection(home, previous(leon.url));
    const run = setup((params) => approve(params), { env: {} });

    const code = await runLogin({}, run.deps);
    await run.browsed();

    expect(code).toBe(0);
    expect(await readConnection(home)).toMatchObject({ ordinateur: HOSTNAME });
    expect(run.err.join('\n')).toMatch(/previous token.*Settings/s);
  });

  it('déjà révoqué (401) : rien à dire', async () => {
    await leon.close();
    leon = await startLeon(home, { revoke: 401 });
    await writeConnection(home, previous(leon.url));
    const run = setup((params) => approve(params), { env: {} });

    expect(await runLogin({}, run.deps)).toBe(0);
    await run.browsed();
    expect(run.err).toEqual([]);
  });

  it('un refus ou un délai dépassé le laissent en place, sans toucher au serveur', async () => {
    await writeConnection(home, previous(leon.url));
    const run = setup(
      async (params) => {
        await comeBack(params, { refus: '1', etat: params.etat });
      },
      { env: {} },
    );

    expect(await runLogin({}, run.deps)).toBe(1);
    await run.browsed();

    expect((await readConnection(home))?.jeton).toBe(OLD_TOKEN);
    expect(leon.calls).toEqual([]);
  });
});

describe('leon login : l’adresse du serveur et les variables', () => {
  it('--url l’emporte sur LEON_URL, qui l’emporte sur la connexion enregistrée', async () => {
    const byFlag = await startLeon(home);
    const saved = await startLeon(home);
    // Chaque essai repart d'une connexion enregistrée, dont l'ancien jeton se révoque sur son propre serveur.
    const saveAt = (url: string) =>
      writeConnection(home, {
        url,
        jeton: OLD_TOKEN,
        ordinateur: 'Ancien',
        espace: 'Acme',
        cree_le: '2026-10-01T10:00:00.000Z',
      });
    const originOf = (run: ReturnType<typeof setup>) => new URL(run.opened[0] as string).origin;
    try {
      await saveAt(saved.url);
      const flag = setup((params) => approve(params), { env: { LEON_URL: leon.url } });
      expect(await runLogin({ url: byFlag.url }, flag.deps)).toBe(0);
      await flag.browsed();
      expect(originOf(flag)).toBe(byFlag.url);

      await saveAt(saved.url);
      const env = setup((params) => approve(params));
      expect(await runLogin({}, env.deps)).toBe(0);
      await env.browsed();
      expect(originOf(env)).toBe(leon.url);

      await saveAt(saved.url);
      const connection = setup((params) => approve(params), { env: {} });
      expect(await runLogin({}, connection.deps)).toBe(0);
      await connection.browsed();
      expect(originOf(connection)).toBe(saved.url);
    } finally {
      await byFlag.close();
      await saved.close();
    }
  });

  it.each([
    ['http hors de la machine', 'http://leon.example'],
    ['pas une adresse', 'pas une url'],
    ['http://localhost:3000@evil.example', 'http://localhost:3000@evil.example'],
  ])('refuse --url %s sans rien ouvrir', async (_name, url) => {
    const run = setup();

    expect(await runLogin({ url }, run.deps)).toBe(1);

    expect(run.opened).toEqual([]);
    expect(run.err.join('\n')).toMatch(/--url/);
    expect(run.everything()).not.toContain('evil.example');
  });

  it('sans adresse nulle part, dit comment la donner', async () => {
    const run = setup(async () => {}, { env: {} });

    expect(await runLogin({}, run.deps)).toBe(1);

    expect(run.opened).toEqual([]);
    expect(run.err.join('\n')).toMatch(/--url/);
  });

  it('prévient que LEON_URL et LEON_TOKEN, posées toutes les deux, passeront avant la connexion enregistrée', async () => {
    const both = setup((params) => approve(params), {
      env: { LEON_URL: leon.url, LEON_TOKEN: OLD_TOKEN },
    });
    expect(await runLogin({}, both.deps)).toBe(0);
    await both.browsed();
    expect(both.err.join('\n')).toMatch(/LEON_URL and LEON_TOKEN.*before the connection/s);
    // Le jeton de la variable ne s'écrit nulle part.
    expect(both.everything()).not.toContain(OLD_TOKEN);

    const one = setup((params) => approve(params));
    expect(await runLogin({}, one.deps)).toBe(0);
    await one.browsed();
    expect(one.err.join('\n')).not.toMatch(/LEON_TOKEN/);
  });
});

describe('leon login : rien de secret dans les messages', () => {
  it('le jeton n’apparaît dans aucune sortie ; l’empreinte, l’etat et le code seulement dans l’adresse', async () => {
    let seen: Params | undefined;
    const run = setup(async (params) => {
      seen = params;
      await approve(params, 'le.code.secret');
    });

    await runLogin({}, run.deps);
    await run.browsed();

    const token = tokenOf(registerCall(leon));
    expect(token).not.toBe('');
    expect(run.everything()).not.toContain(token);
    expect(run.everything()).not.toContain(token.slice(5, 25));
    // L'adresse de K3 est écrite une fois, pour qui n'a pas de navigateur qui s'ouvre. Rien d'autre ne les cite.
    const others = run.everything().replaceAll(run.opened[0] as string, '');
    for (const secret of [seen?.empreinte, seen?.etat, 'le.code.secret']) {
      expect(secret).toBeTruthy();
      expect(others).not.toContain(secret as string);
    }
  });

  it('même quand tout échoue, aucun message ne recopie le jeton, l’empreinte, le code ni l’etat', async () => {
    await leon.close();
    leon = await startLeon(home, { register: 401 });
    let seen: Params | undefined;
    const run = setup(
      async (params) => {
        seen = params;
        await approve(params, 'le.code.secret');
      },
      { env: { LEON_URL: leon.url } },
    );

    await runLogin({}, run.deps);
    await run.browsed();

    const others = run.everything().replaceAll(run.opened[0] as string, '');
    for (const secret of [
      tokenOf(registerCall(leon)),
      seen?.empreinte,
      seen?.etat,
      'le.code.secret',
    ]) {
      expect(others).not.toContain(secret as string);
    }
  });
});

describe('leon login --with-token', () => {
  const TOKEN = `leon_${'t'.repeat(43)}`;

  it('vérifie le jeton par /api/v1/me, puis écrit connexion.json, sans ouvrir de navigateur', async () => {
    const run = setup(async () => {}, { readToken: async () => `${TOKEN}\n` });

    const code = await runLogin({ withToken: true }, run.deps);

    expect(code).toBe(0);
    expect(run.opened).toEqual([]);
    expect(leon.calls).toHaveLength(1);
    expect(leon.calls[0]).toMatchObject({ method: 'GET', path: API_PATHS.me });
    expect(tokenOf(leon.calls[0])).toBe(TOKEN);
    expect(await readConnection(home)).toMatchObject({
      url: leon.url,
      jeton: TOKEN,
      ordinateur: HOSTNAME,
      espace: 'Acme',
    });
    expect((await stat(connectionPath(home))).mode & 0o777).toBe(0o600);
    expect(run.everything()).not.toContain(TOKEN);
    // L'adresse e-mail vient de /api/v1/me.
    expect(run.out.join('\n')).toContain(
      `Connected to Acme as paul@example.com (this computer: ${HOSTNAME})`,
    );
  });

  it('retire aussi les caractères de contrôle de l’espace et du compte', async () => {
    await leon.close();
    leon = await startLeon(home, { espace: 'Ac\u001b[2Jme', compte: 'pa\u0007ul@example.com' });
    const run = setup(async () => {}, {
      env: { LEON_URL: leon.url },
      readToken: async () => TOKEN,
    });

    expect(await runLogin({ withToken: true }, run.deps)).toBe(0);

    expect(run.out.join('\n')).toContain(
      `Connected to Ac[2Jme as paul@example.com (this computer: ${HOSTNAME})`,
    );
    expect(hasControl(run.everything())).toBe(false);
    expect((await readConnection(home))?.espace).toBe('Ac[2Jme');
  });

  it('jeton refusé par /api/v1/me : rien n’est écrit', async () => {
    await leon.close();
    leon = await startLeon(home, { me: 401 });
    const run = setup(async () => {}, {
      env: { LEON_URL: leon.url },
      readToken: async () => TOKEN,
    });

    expect(await runLogin({ withToken: true }, run.deps)).toBe(1);

    expect(await readConnection(home)).toBeNull();
    expect(run.err.join('\n')).toMatch(/refused/);
    expect(run.everything()).not.toContain(TOKEN);
  });

  it('serveur injoignable : rien n’est écrit', async () => {
    const run = setup(async () => {}, {
      readToken: async () => TOKEN,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    expect(await runLogin({ withToken: true }, run.deps)).toBe(1);

    expect(await readConnection(home)).toBeNull();
    expect(run.err.join('\n')).toMatch(/could not reach/i);
  });

  it.each([
    ['vide', ''],
    ['hors motif', 'leon_secret-trop-court'],
    ['pas un jeton', 'bonjour'],
  ])('un jeton %s est refusé avant tout appel, sans le recopier', async (_name, token) => {
    const run = setup(async () => {}, { readToken: async () => token });

    expect(await runLogin({ withToken: true }, run.deps)).toBe(1);

    expect(leon.calls).toEqual([]);
    expect(await readConnection(home)).toBeNull();
    if (token) expect(run.everything()).not.toContain(token);
  });

  it('révoque le jeton qu’il remplace, jamais le même', async () => {
    const previous = {
      url: leon.url,
      jeton: OLD_TOKEN,
      ordinateur: 'Ancien',
      espace: 'Acme',
      cree_le: '2026-10-01T10:00:00.000Z',
    };
    await writeConnection(home, previous);
    const replace = setup(async () => {}, { env: {}, readToken: async () => TOKEN });
    expect(await runLogin({ withToken: true }, replace.deps)).toBe(0);
    expect(leon.calls.map((call) => call.method)).toEqual(['GET', 'DELETE']);
    expect(tokenOf(leon.calls[1])).toBe(OLD_TOKEN);

    leon.calls.length = 0;
    const same = setup(async () => {}, { env: {}, readToken: async () => TOKEN });
    expect(await runLogin({ withToken: true }, same.deps)).toBe(0);
    expect(leon.calls.map((call) => call.method)).toEqual(['GET']);
    expect((await readConnection(home))?.jeton).toBe(TOKEN);
  });
});

describe('readTokenFromInput', () => {
  it('hors d’un terminal : la première ligne', async () => {
    const output = new PassThrough();

    const token = await readTokenFromInput(Readable.from(['leon_abc\nsuite\n']), output);

    expect(token).toBe('leon_abc');
  });

  it('hors d’un terminal et sans rien : une chaîne vide', async () => {
    expect(await readTokenFromInput(Readable.from([]), new PassThrough())).toBe('');
  });

  it('sur un terminal : ne fait pas écho à ce qui est tapé', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    let shown = '';
    const output = Object.assign(
      new Writable({
        write(chunk, _encoding, done) {
          shown += chunk.toString();
          done();
        },
      }),
      { isTTY: true },
    );

    const reading = readTokenFromInput(input, output);
    input.write('leon_secret-tape');
    input.write('\r');

    expect(await reading).toBe('leon_secret-tape');
    expect(shown).toMatch(/token/i);
    expect(shown).not.toContain('leon_secret');
  });
});

describe('leon logout', () => {
  const connected = (url: string) => ({
    url,
    jeton: OLD_TOKEN,
    ordinateur: 'Mac',
    espace: 'Acme',
    cree_le: '2026-10-01T10:00:00.000Z',
  });
  const logoutDeps = (overrides: Partial<LoginDeps> = {}) => {
    const run = setup(async () => {}, { env: {}, ...overrides });
    return run;
  };

  it('révoque le jeton (K6) puis efface connexion.json', async () => {
    await writeConnection(home, connected(leon.url));
    const run = logoutDeps();

    const code = await runLogout(run.deps);

    expect(code).toBe(0);
    expect(leon.calls).toHaveLength(1);
    expect(leon.calls[0]).toMatchObject({ method: 'DELETE', path: API_PATHS.jeton });
    expect(tokenOf(leon.calls[0])).toBe(OLD_TOKEN);
    expect(await readConnection(home)).toBeNull();
    await expect(stat(connectionPath(home))).rejects.toThrow();
    expect(run.err).toEqual([]);
    expect(run.everything()).not.toContain(OLD_TOKEN);
  });

  it('serveur injoignable : efface quand même, en le disant', async () => {
    await writeConnection(home, connected(leon.url));
    const run = logoutDeps({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const code = await runLogout(run.deps);

    expect(code).toBe(0);
    expect(await readConnection(home)).toBeNull();
    expect(run.err.join('\n')).toMatch(/could not reach.*Settings/is);
    expect(run.everything()).not.toContain(OLD_TOKEN);
  });

  it('jeton déjà révoqué (401) : efface sans bruit', async () => {
    await leon.close();
    leon = await startLeon(home, { revoke: 401 });
    await writeConnection(home, connected(leon.url));
    const run = logoutDeps();

    expect(await runLogout(run.deps)).toBe(0);

    expect(await readConnection(home)).toBeNull();
    expect(run.err).toEqual([]);
  });

  it('réponse inattendue du serveur : efface quand même, en le disant', async () => {
    await leon.close();
    leon = await startLeon(home, { revoke: 500 });
    await writeConnection(home, connected(leon.url));
    const run = logoutDeps();

    expect(await runLogout(run.deps)).toBe(0);

    expect(await readConnection(home)).toBeNull();
    expect(run.err.join('\n')).toMatch(/Settings/);
  });

  it('pas connecté : le dit, sans rien demander au serveur', async () => {
    const run = logoutDeps();

    expect(await runLogout(run.deps)).toBe(0);

    expect(leon.calls).toEqual([]);
    expect(run.out.join('\n')).toMatch(/not connected/i);
  });

  it('un connexion.json invalide est effacé, sans appel au serveur', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(connectionPath(home), 'pas du JSON');
    const run = logoutDeps();

    expect(await runLogout(run.deps)).toBe(0);

    expect(leon.calls).toEqual([]);
    await expect(stat(connectionPath(home))).rejects.toThrow();
  });

  it('prévient que LEON_URL et LEON_TOKEN, posées toutes les deux, restent en place', async () => {
    await writeConnection(home, connected(leon.url));
    const run = logoutDeps({ env: { LEON_URL: leon.url, LEON_TOKEN: OLD_TOKEN } });

    expect(await runLogout(run.deps)).toBe(0);

    expect(run.err.join('\n')).toMatch(/LEON_URL and LEON_TOKEN.*still/s);
    expect(run.everything()).not.toContain(OLD_TOKEN);
  });
});

// Le vrai `leon.ts`, lancé comme `pnpm leon …` : un jeton tapé sur la ligne de commande (`--with-token leon_…` est
// l'erreur naturelle avec ce nom d'option) ne doit sortir ni sur stdout ni sur stderr, quelle que soit la façon dont
// les arguments sont refusés. Rien n'est lu ni écrit : ces commandes s'arrêtent avant tout réseau.
describe('leon : un jeton passé en argument', () => {
  const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const TYPED = `leon_${'Z'.repeat(43)}`;

  it('parseLoginArgs lit --url et --with-token', () => {
    expect(parseLoginArgs([])).toEqual({ url: undefined, withToken: false });
    expect(parseLoginArgs(['--with-token'])).toEqual({ url: undefined, withToken: true });
    expect(parseLoginArgs(['--url', 'https://leon.example'])).toEqual({
      url: 'https://leon.example',
      withToken: false,
    });
    expect(parseLoginArgs(['--with-token', '--url=https://leon.example'])).toEqual({
      url: 'https://leon.example',
      withToken: true,
    });
  });

  it('parseLoginArgs : un argument en position donne un message fixe, qui ne le recopie pas', () => {
    for (const args of [
      ['--with-token', TYPED],
      [TYPED],
      ['--url', 'https://leon.example', TYPED],
    ]) {
      const failure = (() => {
        try {
          return parseLoginArgs(args);
        } catch (error) {
          return error as Error;
        }
      })();

      expect(failure).toBeInstanceOf(Error);
      const { message } = failure as Error;
      expect(message).toMatch(/standard input/);
      expect(message).toMatch(/shell history/);
      expect(message).toMatch(/revoke it in Settings/);
      expect(message).not.toContain(TYPED);
    }
  });

  it.each([
    ['une option inconnue avec une valeur', [`--jeton=${TYPED}`]],
    ['une option courte inconnue', ['-t', TYPED]],
    ['une valeur collée à --with-token', [`--with-token=${TYPED}`]],
    ['--url sans valeur', ['--url']],
  ])('parseLoginArgs : %s donne l’aide, sans rien recopier', (_name, args) => {
    expect(() => parseLoginArgs(args)).toThrow(
      'Usage: leon login [--url <address>] [--with-token]',
    );
    try {
      parseLoginArgs(args);
    } catch (error) {
      expect((error as Error).message).not.toContain(TYPED);
    }
  });

  function runCli(args: string[]) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
      const env: Record<string, string> = {
        PATH: process.env.PATH ?? '',
        HOME: home,
        TMPDIR: tmpdir(),
      };
      const options: SpawnOptionsWithoutStdio = { cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv };
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'src/cli/leon.ts', ...args],
        options,
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.stdin.end();
      child.on('error', fail);
      child.on('close', (code) => done({ code, stdout, stderr }));
    });
  }

  it.each([
    ['en position après --with-token', ['login', '--with-token', TYPED]],
    ['en position seul', ['login', TYPED]],
    ['collé à --with-token', ['login', `--with-token=${TYPED}`]],
    ['en option inconnue', ['login', `--jeton=${TYPED}`]],
    ['en option courte inconnue', ['login', '-t', TYPED]],
    ['avec --url', ['login', '--url', 'https://leon.example', '--with-token', TYPED]],
  ])(
    'leon login : le jeton %s n’est recopié nulle part',
    async (_name, args) => {
      const outcome = await runCli(args);

      expect(outcome.code).toBe(1);
      expect(outcome.stdout + outcome.stderr).not.toContain(TYPED);
      expect(outcome.stdout + outcome.stderr).not.toContain(TYPED.slice(5, 25));
      await expect(stat(connectionPath(home))).rejects.toThrow();
    },
    30_000,
  );

  it('leon logout ne lit aucune option : un argument ne revient dans aucune sortie', async () => {
    const outcome = await runCli(['logout', TYPED]);

    expect(outcome.code).toBe(0);
    expect(outcome.stdout + outcome.stderr).not.toContain(TYPED);
  }, 30_000);
});
