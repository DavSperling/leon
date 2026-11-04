import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentCache } from './client-document';
import { readClientId } from './clients';

afterEach(() => vi.restoreAllMocks());

const CHATGPT_URL = 'https://chatgpt.com/oauth/client.json';
const CHATGPT_REDIRECT = 'https://chatgpt.com/connector/oauth/abc123';
const CLAUDE_CODE_URL = 'https://claude.ai/oauth/claude-code-client-metadata';
const T0 = 1_800_000_000_000;

const documentOf = (url: string, extra: Record<string, unknown> = {}) => ({
  client_id: url,
  client_name: 'ChatGPT',
  redirect_uris: [CHATGPT_REDIRECT],
  token_endpoint_auth_method: 'none',
  ...extra,
});

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(
    (typeof body === 'string' || body instanceof Uint8Array
      ? body
      : JSON.stringify(body)) as BodyInit,
    { status: 200, headers: { 'content-type': 'application/json', ...headers } },
  );

// Un faux fetch : ce qu'il rend, et ce qu'on lui a demandé. Jamais le réseau.
const fakeFetch = (answer: () => Response | Promise<Response>) =>
  vi.fn<typeof globalThis.fetch>(async () => answer());

// Chaque test a sa propre mémoire : le cache du module ne passe pas d'un test à l'autre.
const read = (value: string, fetch: typeof globalThis.fetch, extra: object = {}) =>
  readClientId(value, { fetch, cache: new Map(), ...extra });

describe('readClientId : un document CIMD (L10)', () => {
  it('lit le document de ChatGPT', async () => {
    const fetch = fakeFetch(() => ok(documentOf(CHATGPT_URL)));

    expect(await read(CHATGPT_URL, fetch)).toEqual({
      name: 'ChatGPT',
      redirectUris: [CHATGPT_REDIRECT],
      host: 'chatgpt.com',
      ref: createHash('sha256').update(CHATGPT_URL).digest('hex'),
    });
  });

  it('lit le document de Claude Code : le bouclage donne 127.0.0.1', async () => {
    const fetch = fakeFetch(() =>
      ok(
        documentOf(CLAUDE_CODE_URL, {
          client_name: 'Claude Code',
          redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
        }),
      ),
    );

    expect(await read(CLAUDE_CODE_URL, fetch)).toMatchObject({
      name: 'Claude Code',
      redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
      host: '127.0.0.1',
    });
  });

  it('demande l’adresse telle quelle, sans suivre de redirection, en 5 s, sans en-tête ni cookie', async () => {
    const fetch = fakeFetch(() => ok(documentOf(CHATGPT_URL)));
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await read(CHATGPT_URL, fetch);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(CHATGPT_URL);
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(init?.headers).toBeUndefined();
    expect(init?.credentials).toBeUndefined();
    expect(init?.method).toBeUndefined(); // GET
    expect(Object.keys(init ?? {}).sort()).toEqual(['redirect', 'signal']);
  });

  it('nettoie le nom du document comme celui d’une inscription', async () => {
    const fetch = fakeFetch(() => ok(documentOf(CHATGPT_URL, { client_name: 'Chat\u0000GPT\n' })));
    expect((await read(CHATGPT_URL, fetch))?.name).toBe('ChatGPT');
    const empty = fakeFetch(() => ok(documentOf(CHATGPT_URL, { client_name: '' })));
    expect((await read(CHATGPT_URL, empty))?.name).toBe('MCP client');
  });

  it.each(['client_secret_basic', 'private_key_jwt', 'none', 'inconnu'])(
    'lit comme public un document qui demande token_endpoint_auth_method = %s (F4)',
    async (method) => {
      const fetch = fakeFetch(() =>
        ok(documentOf(CHATGPT_URL, { token_endpoint_auth_method: method })),
      );
      expect(await read(CHATGPT_URL, fetch)).toMatchObject({ name: 'ChatGPT' });
    },
  );
});

describe('readClientId : les adresses qu’il ne lit jamais', () => {
  it.each([
    'https://evil.example/client.json',
    'https://127.0.0.1/c.json',
    'https://localhost/c.json',
    'https://169.254.169.254/latest/meta-data',
    'https://chatgpt.com.evil.example/oauth/client.json',
    'https://evil.example/https://chatgpt.com/oauth/client.json',
    'https://chatgpt.com@evil.example/oauth/client.json',
    'https://evil.example@chatgpt.com/oauth/client.json',
    'https://sub.chatgpt.com/oauth/client.json',
    'https://chatgpt.com./oauth/client.json',
    'https://CHATGPT.COM/oauth/client.json',
    'http://chatgpt.com/oauth/client.json',
    'https://chatgpt.com:8443/oauth/client.json',
    'https://chatgpt.com:443/oauth/client.json',
    'https://chatgpt.com',
    'https://chatgpt.com/',
    'https://chatgpt.com/oauth/client.json?x=1',
    'https://chatgpt.com/oauth/client.json?',
    'https://chatgpt.com/oauth/client.json#x',
    'https://chatgpt.com/oauth/client.json#',
    'https://chatgpt.com/oauth/../client.json',
    'https://chatgpt.com/oauth/./client.json',
    'https://chatgpt.com\\oauth\\client.json',
    'https://chatgpt.com/oauth/client.json\t',
    `https://chatgpt.com/${'a'.repeat(512)}`,
    'ftp://chatgpt.com/oauth/client.json',
    'file:///etc/passwd',
    'https://',
    'https:',
  ])('« %s » : null, sans appel', async (value) => {
    const fetch = fakeFetch(() => ok(documentOf(value)));
    expect(await read(value, fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'claude.ai',
    'chatgpt.com',
    'www.cursor.com',
    'vscode.dev',
    'insiders.vscode.dev',
    'antigravity.google',
  ])('lit chez %s, un hôte de L11', async (host) => {
    const url = `https://${host}/oauth/client.json`;
    const fetch = fakeFetch(() => ok(documentOf(url)));
    expect(await read(url, fetch)).not.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('readClientId : tout échec vaut « client inconnu »', () => {
  it('une redirection : null (fetch refuse de la suivre)', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await read(CHATGPT_URL, fetch)).toBeNull();
  });

  it('une réponse de redirection qui arriverait quand même : null', async () => {
    const fetch = fakeFetch(
      () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.example/c.json' } }),
    );
    expect(await read(CHATGPT_URL, fetch)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([201, 204, 301, 403, 404, 500])('un statut %s : null', async (status) => {
    const fetch = fakeFetch(
      () => new Response(JSON.stringify(documentOf(CHATGPT_URL)), { status }),
    );
    expect(await read(CHATGPT_URL, fetch)).toBeNull();
  });

  it('une erreur réseau : null', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await read(CHATGPT_URL, fetch)).toBeNull();
  });

  describe('la taille : 16 Ko au plus', () => {
    const MAX = 16 * 1024;
    const padded = (size: number) => {
      const base = JSON.stringify(documentOf(CHATGPT_URL, { pad: '' }));
      return base.replace('"pad":""', `"pad":"${'a'.repeat(size - base.length)}"`);
    };

    it('lit un document de 16 Ko pile', async () => {
      const text = padded(MAX);
      expect(new TextEncoder().encode(text).length).toBe(MAX);
      expect(
        await read(
          CHATGPT_URL,
          fakeFetch(() => ok(text)),
        ),
      ).not.toBeNull();
    });

    it('refuse un document de 16 Ko + 1 octet', async () => {
      const text = padded(MAX + 1);
      expect(new TextEncoder().encode(text).length).toBe(MAX + 1);
      expect(
        await read(
          CHATGPT_URL,
          fakeFetch(() => ok(text)),
        ),
      ).toBeNull();
    });

    it('compte des octets, pas des caractères', async () => {
      const text = padded(MAX).replace(/a{4000}/, 'é'.repeat(4000)); // 2 octets chacun
      expect(
        await read(
          CHATGPT_URL,
          fakeFetch(() => ok(text)),
        ),
      ).toBeNull();
    });

    it('refuse sur le Content-Length, sans lire le corps', async () => {
      let cancelled = false;
      const fetch = fakeFetch(
        () =>
          new Response(
            new ReadableStream({
              // Le flux se remplit d'avance d'un morceau : on vérifie qu'il est abandonné, pas qu'il n'a rien produit.
              pull(controller) {
                controller.enqueue(new TextEncoder().encode('{}'));
              },
              cancel() {
                cancelled = true;
              },
            }),
            { status: 200, headers: { 'content-length': String(MAX + 1) } },
          ),
      );
      expect(await read(CHATGPT_URL, fetch)).toBeNull();
      expect(cancelled).toBe(true);
    });

    it('coupe un flux sans fin sans tout lire en mémoire', async () => {
      let pulled = 0;
      let cancelled = false;
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(1024).fill(97));
        },
        cancel() {
          cancelled = true;
        },
      });
      const fetch = fakeFetch(() => new Response(endless, { status: 200 }));

      expect(await read(CHATGPT_URL, fetch)).toBeNull();
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(25); // 16 morceaux de 1 Ko, le dernier de trop, et la marge du flux
    });
  });

  describe('les 5 s', () => {
    // Comme le vrai fetch : le signal abandonné fait échouer la requête, et la lecture du corps en cours.
    const slowHeaders = () =>
      vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      );
    const slowBody = () =>
      vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
            controller.enqueue(new TextEncoder().encode('{"client_id":'));
          },
        });
        return new Response(stream, { status: 200 });
      });

    it('une réponse qui n’arrive pas : null', async () => {
      expect(await read(CHATGPT_URL, slowHeaders(), { timeoutMs: 30 })).toBeNull();
    });

    it('un corps qui n’en finit pas : null', async () => {
      expect(await read(CHATGPT_URL, slowBody(), { timeoutMs: 30 })).toBeNull();
    });
  });

  it.each([
    ['du texte', 'pas du JSON'],
    ['un JSON tronqué', '{"client_id": "https://chatgpt.com/oauth/client.json", "client_name"'],
    ['une réponse vide', ''],
    ['du UTF-8 invalide', new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
    ['null', 'null'],
    ['un tableau', '[]'],
    ['un nombre', '42'],
    ['une chaîne', '"https://chatgpt.com/oauth/client.json"'],
  ])('%s : null', async (_case, body) => {
    expect(
      await read(
        CHATGPT_URL,
        fakeFetch(() => ok(body)),
      ),
    ).toBeNull();
  });

  it.each([
    ['un client_id différent de l’adresse', { client_id: 'https://chatgpt.com/oauth/autre.json' }],
    ['un client_id d’un autre hôte', { client_id: 'https://evil.example/client.json' }],
    ['un client_id qui diffère d’une barre', { client_id: `${CHATGPT_URL}/` }],
    ['un client_id absent', { client_id: undefined }],
    ['un client_id qui n’est pas un texte', { client_id: 42 }],
    ['pas de client_name', { client_name: undefined }],
    ['un client_name qui n’est pas un texte', { client_name: ['ChatGPT'] }],
    ['pas de redirect_uris', { redirect_uris: undefined }],
    ['redirect_uris vide', { redirect_uris: [] }],
    ['redirect_uris qui n’est pas une liste', { redirect_uris: CHATGPT_REDIRECT }],
    ['6 adresses de retour', { redirect_uris: Array(6).fill(CHATGPT_REDIRECT) }],
    ['une adresse de retour hors de L11', { redirect_uris: ['https://evil.example/cb'] }],
    [
      'une adresse hors de L11 parmi des bonnes : le client est refusé en entier',
      { redirect_uris: [CHATGPT_REDIRECT, 'https://evil.example/cb'] },
    ],
    [
      'un autre chemin d’un hôte connu',
      { redirect_uris: ['https://chatgpt.com/oauth/client.json'] },
    ],
    [
      'un schéma d’application',
      { redirect_uris: ['cursor://anysphere.cursor-mcp/oauth/callback'] },
    ],
    ['un bouclage avec identifiant', { redirect_uris: ['http://user:pw@127.0.0.1:9/cb'] }],
  ])('%s : null', async (_case, change) => {
    const fetch = fakeFetch(() => ok(documentOf(CHATGPT_URL, change)));
    expect(await read(CHATGPT_URL, fetch)).toBeNull();
  });

  it('ne journalise qu’une raison, jamais l’adresse ni le contenu', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const others = (['log', 'info', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const url = 'https://chatgpt.com/oauth/secret-path.json';
    const failures: Array<[string, () => Response | Promise<Response>]> = [
      ['https://evil.example/secret-path.json', () => ok('{}')],
      [url, () => ok('pas du json')],
      [url.replace('secret-path', 'autre'), () => new Response('', { status: 500 })],
      [url.replace('secret-path', 'id'), () => ok(documentOf('https://chatgpt.com/x.json'))],
      [
        url.replace('secret-path', 'redirect'),
        () =>
          ok(
            documentOf(url.replace('secret-path', 'redirect'), {
              client_name: 'Nom-secret',
              redirect_uris: ['https://evil.example/cb-secret'],
            }),
          ),
      ],
    ];
    for (const [value, answer] of failures) expect(await read(value, fakeFetch(answer))).toBeNull();
    const failing = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError(`fetch failed ${url}`);
    });
    expect(await read(url, failing)).toBeNull();

    expect(warn).toHaveBeenCalledTimes(failures.length + 1);
    const logged = [warn, ...others].flatMap((spy) => spy.mock.calls).map((a) => JSON.stringify(a));
    for (const forbidden of ['secret', 'chatgpt', 'evil', 'Nom-secret', '.json', 'https']) {
      expect(logged.join('\n')).not.toContain(forbidden);
    }
  });
});

describe('le cache des documents', () => {
  const cached = (headers: Record<string, string> = {}) =>
    fakeFetch(() => ok(documentOf(CHATGPT_URL), headers));
  const at = (fetch: typeof globalThis.fetch, cache: DocumentCache, seconds: number) =>
    readClientId(CHATGPT_URL, { fetch, cache, now: T0 + seconds * 1000 });

  it('relit le document de ChatGPT depuis le cache, sans nouvel appel', async () => {
    const fetch = cached();
    const cache = new Map() as DocumentCache;
    const first = await at(fetch, cache, 0);
    const second = await at(fetch, cache, 1);
    expect(second).toEqual(first);
    expect(first).not.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('garde par défaut les documents en mémoire, d’un appel à l’autre', async () => {
    const url = 'https://chatgpt.com/oauth/cache-par-defaut.json';
    const fetch = fakeFetch(() => ok(documentOf(url)));
    expect(await readClientId(url, { fetch })).not.toBeNull();
    expect(await readClientId(url, { fetch })).not.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('une minute sans en-tête Cache-Control', async () => {
    const fetch = cached();
    const cache = new Map() as DocumentCache;
    await at(fetch, cache, 0);
    await at(fetch, cache, 59);
    expect(fetch).toHaveBeenCalledTimes(1);
    await at(fetch, cache, 61);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('une minute quand Cache-Control n’a pas de max-age', async () => {
    const fetch = cached({ 'cache-control': 'public' });
    const cache = new Map() as DocumentCache;
    await at(fetch, cache, 0);
    await at(fetch, cache, 59);
    await at(fetch, cache, 61);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('selon max-age', async () => {
    const fetch = cached({ 'cache-control': 'public, max-age=300' });
    const cache = new Map() as DocumentCache;
    await at(fetch, cache, 0);
    await at(fetch, cache, 299);
    expect(fetch).toHaveBeenCalledTimes(1);
    await at(fetch, cache, 301);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('une heure au plus, quel que soit max-age', async () => {
    const fetch = cached({ 'cache-control': 'max-age=86400' });
    const cache = new Map() as DocumentCache;
    await at(fetch, cache, 0);
    await at(fetch, cache, 3599);
    expect(fetch).toHaveBeenCalledTimes(1);
    await at(fetch, cache, 3601);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['no-store', 'no-cache', 'max-age=0', 'private, no-store, max-age=600'])(
    'ne garde pas un document servi avec Cache-Control: %s',
    async (header) => {
      const fetch = cached({ 'cache-control': header });
      const cache = new Map() as DocumentCache;
      await at(fetch, cache, 0);
      await at(fetch, cache, 1);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('garde un échec une minute au plus, même si le serveur dit une heure', async () => {
    const fetch = fakeFetch(
      () => new Response('erreur', { status: 500, headers: { 'cache-control': 'max-age=3600' } }),
    );
    const cache = new Map() as DocumentCache;
    expect(await at(fetch, cache, 0)).toBeNull();
    expect(await at(fetch, cache, 59)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await at(fetch, cache, 61)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('garde de même un échec de réseau, et le document qui revient est relu ensuite', async () => {
    let up = false;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      if (!up) throw new TypeError('fetch failed');
      return ok(documentOf(CHATGPT_URL));
    });
    const cache = new Map() as DocumentCache;
    expect(await at(fetch, cache, 0)).toBeNull();
    up = true;
    expect(await at(fetch, cache, 30)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await at(fetch, cache, 61)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('une adresse de retour retirée du document cesse de valoir à la relecture', async () => {
    const two = [CHATGPT_REDIRECT, 'https://chatgpt.com/connector/oauth/autre'];
    let answer = documentOf(CHATGPT_URL, { redirect_uris: two });
    const fetch = fakeFetch(() => ok(answer, { 'cache-control': 'max-age=60' }));
    const cache = new Map() as DocumentCache;
    expect((await at(fetch, cache, 0))?.redirectUris).toEqual(two);
    answer = documentOf(CHATGPT_URL, { redirect_uris: [CHATGPT_REDIRECT] });
    expect((await at(fetch, cache, 30))?.redirectUris).toEqual(two);
    expect((await at(fetch, cache, 61))?.redirectUris).toEqual([CHATGPT_REDIRECT]);
  });

  it.each([
    ['un client_id différent de l’adresse', { client_id: 'https://chatgpt.com/oauth/autre.json' }],
    ['une adresse de retour hors de L11', { redirect_uris: ['https://evil.example/cb'] }],
    ['un champ manquant', { client_name: undefined }],
  ])(
    'un document lu mais refusé (%s) n’est gardé qu’une minute, compté une fois, et le document corrigé passe ensuite',
    async (_case, change) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let served = documentOf(CHATGPT_URL, change);
      const fetch = fakeFetch(() => ok(served, { 'cache-control': 'max-age=3600' }));
      const cache = new Map() as DocumentCache;

      expect(await at(fetch, cache, 0)).toBeNull();
      served = documentOf(CHATGPT_URL); // le client corrige son document
      expect(await at(fetch, cache, 30)).toBeNull();
      expect(await at(fetch, cache, 59)).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce(); // le refus gardé en mémoire ne se recompte pas

      expect(await at(fetch, cache, 61)).toMatchObject({ name: 'ChatGPT' });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledOnce();
      // le document corrigé, lui, est gardé selon son Cache-Control (une heure)
      expect(await at(fetch, cache, 3000)).toMatchObject({ name: 'ChatGPT' });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('ne garde pas plus de 100 documents : une adresse qui varie ne fait pas grossir la mémoire', async () => {
    const fetch = fakeFetch(() => new Response('', { status: 404 }));
    const cache = new Map() as DocumentCache;
    for (let i = 0; i < 250; i++) {
      await readClientId(`https://chatgpt.com/oauth/${i}.json`, { fetch, cache, now: T0 });
    }
    expect(fetch).toHaveBeenCalledTimes(250);
    expect(cache.size).toBeLessThanOrEqual(100);
  });

  // Un faux serveur : chaque adresse sert son propre document, sauf celles de `refused`, en 404.
  const serving = (refused: (url: string) => boolean = () => false) =>
    vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      return refused(url) ? new Response('', { status: 404 }) : ok(documentOf(url));
    });

  it('cent refus de suite ne chassent pas un document accepté', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = serving((url) => url.includes('/refus-'));
    const cache = new Map() as DocumentCache;
    expect(await at(fetch, cache, 0)).toMatchObject({ name: 'ChatGPT' });

    for (let i = 0; i < 250; i++) {
      await readClientId(`https://chatgpt.com/oauth/refus-${i}.json`, { fetch, cache, now: T0 });
    }

    expect(cache.size).toBeLessThanOrEqual(100);
    fetch.mockClear();
    expect(await at(fetch, cache, 1)).toMatchObject({ name: 'ChatGPT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('une mémoire pleine de documents acceptés n’en perd aucun pour un refus ; un document accepté de plus chasse le plus ancien', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = serving((url) => url.includes('/refus-'));
    const cache = new Map() as DocumentCache;
    const accepted = (i: number) => `https://chatgpt.com/oauth/ok-${i}.json`;
    for (let i = 0; i < 100; i++) await readClientId(accepted(i), { fetch, cache, now: T0 });
    expect(cache.size).toBe(100);

    await readClientId('https://chatgpt.com/oauth/refus-1.json', { fetch, cache, now: T0 });
    expect(cache.size).toBe(100);
    expect([...cache.keys()]).toContain(accepted(0));
    expect(cache.has('https://chatgpt.com/oauth/refus-1.json')).toBe(false);

    await readClientId(accepted(100), { fetch, cache, now: T0 });
    expect(cache.size).toBe(100);
    expect(cache.has(accepted(0))).toBe(false);
    expect(cache.has(accepted(100))).toBe(true);
  });

  describe('lectures simultanées', () => {
    it('deux lectures de la même adresse partagent une seule requête sortante', async () => {
      let release = () => {};
      const fetch = vi.fn<typeof globalThis.fetch>(
        () =>
          new Promise((resolve) => {
            release = () => resolve(ok(documentOf(CHATGPT_URL)));
          }),
      );
      const cache = new Map() as DocumentCache;

      const first = readClientId(CHATGPT_URL, { fetch, cache, now: T0 });
      const second = readClientId(CHATGPT_URL, { fetch, cache, now: T0 });
      release();

      expect(await Promise.all([first, second])).toEqual([
        expect.objectContaining({ name: 'ChatGPT' }),
        expect.objectContaining({ name: 'ChatGPT' }),
      ]);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('deux adresses différentes ne se partagent pas ; la lecture finie, l’expiration relit', async () => {
      const fetch = serving();
      const cache = new Map() as DocumentCache;
      const a = 'https://chatgpt.com/oauth/a.json';
      const b = 'https://chatgpt.com/oauth/b.json';

      await Promise.all([a, b].map((url) => readClientId(url, { fetch, cache, now: T0 })));
      expect(fetch).toHaveBeenCalledTimes(2);

      await readClientId(a, { fetch, cache, now: T0 + 61 * 60 * 1000 });
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('un échec partagé n’est pas gardé comme une lecture en cours : la suivante relit', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValueOnce(new Error('réseau'))
        .mockImplementation(async () => ok(documentOf(CHATGPT_URL)));
      const cache = new Map() as DocumentCache;

      const failed = await Promise.all([
        readClientId(CHATGPT_URL, { fetch, cache, now: T0 }),
        readClientId(CHATGPT_URL, { fetch, cache, now: T0 }),
      ]);
      expect(failed).toEqual([null, null]);
      expect(fetch).toHaveBeenCalledOnce();

      // le refus est gardé une minute ; passé ce délai, rien ne reste en cours et le document se lit
      expect(await at(fetch, cache, 61)).toMatchObject({ name: 'ChatGPT' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('ne garde rien pour une adresse qu’il ne lit pas', async () => {
    const fetch = cached();
    const cache = new Map() as DocumentCache;
    await readClientId('https://evil.example/client.json', { fetch, cache });
    expect(cache.size).toBe(0);
  });
});
