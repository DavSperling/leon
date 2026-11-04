import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { readClientId } from '@/server/oauth/clients';
import { apiRequest } from '@/test/api-request';
import { app } from './app';

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => apiRequest(API_PATHS.oauthClients, { body });

// Espionne console.* : rien de ce que le client a envoyé ne doit y passer.
function spyConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  return () => spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args));
}

describe('POST /api/oauth/clients (L4)', () => {
  it.each([
    ['Claude', 'Claude', ['https://claude.ai/api/mcp/auth_callback'], 'claude.ai'],
    ['ChatGPT', 'ChatGPT', ['https://chatgpt.com/connector/oauth/abc123'], 'chatgpt.com'],
    ['Claude Code', 'Claude Code', ['http://localhost:3118/callback'], '127.0.0.1'],
    [
      'VS Code (bureau)',
      'Visual Studio Code',
      [
        'http://127.0.0.1/',
        'http://127.0.0.1:33418/',
        'https://vscode.dev/redirect',
        'https://insiders.vscode.dev/redirect',
      ],
      '127.0.0.1',
    ],
    [
      'Cursor',
      'Cursor',
      ['https://www.cursor.com/agents/mcp/oauth/callback', 'http://127.0.0.1:54321/oauth/callback'],
      'www.cursor.com',
    ],
  ])(
    'répond 201 à %s, sans jeton ni session, et le client_id se relit',
    async (_who, name, uris, host) => {
      const response = await post({
        client_name: name,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });

      expect(response.status).toBe(201);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await response.json();
      expect(body).toEqual({
        client_id: expect.stringMatching(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/),
        client_id_issued_at: expect.any(Number),
        client_name: name,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(Math.abs(body.client_id_issued_at - Date.now() / 1000)).toBeLessThan(5);
      expect(await readClientId(body.client_id)).toMatchObject({
        name,
        redirectUris: uris,
        host,
      });
    },
  );

  it('répond 201 avec « none » quand le client demande client_secret_basic', async () => {
    const response = await post({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
    expect(response.status).toBe(201);
    expect((await response.json()).token_endpoint_auth_method).toBe('none');
  });

  it('ne demande ni cookie ni en-tête Authorization, même avec un faux jeton ou un faux cookie', async () => {
    const response = await app.request(API_PATHS.oauthClients, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer leon_pas-un-vrai-jeton',
        cookie: 'better-auth.session_token=faux',
      },
      body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
    });
    expect(response.status).toBe(201);
  });

  it.each([
    'https://evil.example/cb',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://claude.ai:8443/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai/autre',
    'https://chatgpt.com/connector/oauth/a/b',
    'https://chatgpt.com/connector_platform_oauth_redirect?x=1',
    'http://user:pw@127.0.0.1:9/cb',
    'javascript:alert(1)',
    'https://claude.ai/api/mcp/auth_callback#frag',
  ])('répond 400 invalid_redirect_uri pour « %s »', async (uri) => {
    const response = await post({ client_name: 'Claude', redirect_uris: [uri] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_redirect_uri' });
  });

  it('répond 400 pour 6 adresses, pour une adresse de 513 caractères, ou sans adresse', async () => {
    const claude = 'https://claude.ai/api/mcp/auth_callback';
    const long = `http://localhost:1/${'a'.repeat(513 - 'http://localhost:1/'.length)}`;
    for (const redirect_uris of [Array(6).fill(claude), [long], [], undefined]) {
      const response = await post({ redirect_uris });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_redirect_uri' });
    }
  });

  it('répond 400 invalid_client_metadata pour des grant_types sans authorization_code ou des response_types autres que code', async () => {
    const redirect_uris = ['https://claude.ai/api/mcp/auth_callback'];
    for (const extra of [{ grant_types: ['refresh_token'] }, { response_types: ['token'] }]) {
      const response = await post({ redirect_uris, ...extra });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  it('répond 400 pour un corps qui n’est pas un objet JSON', async () => {
    for (const body of ['pas du json', '[]', 'null', '42', '']) {
      const response = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  describe('au plus 4 Ko d’entrée', () => {
    const body = (size: number) => {
      const base = { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], pad: '' };
      const padding = size - JSON.stringify(base).length;
      return JSON.stringify({ ...base, pad: 'a'.repeat(padding) });
    };

    it('accepte 4 Ko pile', async () => {
      const text = body(4096);
      expect(text).toHaveLength(4096);
      const response = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
      });
      expect(response.status).toBe(201);
    });

    it('refuse 4 Ko + 1 octet : 400, que la taille soit annoncée ou non', async () => {
      const text = body(4097);
      const declared = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
        body: text,
      });
      const streamed = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          },
        }),
        // @ts-expect-error duplex est requis par Node pour un corps en flux
        duplex: 'half',
      });
      for (const response of [declared, streamed]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
      }
    });
  });

  it('ne journalise rien, ni le nom ni les adresses ni le client_id', async () => {
    const logged = spyConsole();
    const ok = await post({
      client_name: 'Nom-secret',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    });
    await post({
      client_name: 'Nom-secret',
      redirect_uris: ['https://evil.example/adresse-secrete'],
    });
    await post('pas un objet');

    expect(ok.status).toBe(201);
    expect(logged()).toEqual([]);
  });

  it('ne répond qu’au POST', async () => {
    const response = await apiRequest(API_PATHS.oauthClients);
    expect(response.status).toBe(404);
  });
});
