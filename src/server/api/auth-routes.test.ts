import { beforeEach, describe, expect, it, vi } from 'vitest';

const handler = vi.hoisted(() => vi.fn(async () => new Response('ok')));
vi.mock('@/server/auth/auth', () => ({ auth: { handler } }));

const { authRoutes } = await import('./auth-routes');

const MO = 1024 * 1024;
const CHUNK = 16 * 1024;

// Un corps de 1 Mo envoyé en morceaux, sans Content-Length : compte les morceaux lus.
function streamedMegabyte() {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled * CHUNK >= MO) return controller.close();
      pulled += 1;
      controller.enqueue(new Uint8Array(CHUNK));
    },
  });
  return { body, pulled: () => pulled };
}

beforeEach(() => handler.mockClear());

// Audit 4 n° 5.
describe('/api/auth/*', () => {
  it('refuse en 413 un corps de 1 Mo annoncé, sans le passer à Better Auth', async () => {
    const response = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(MO) },
      body: 'x'.repeat(MO),
    });
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuse en 413 un corps de 1 Mo en flux, sans le lire en entier', async () => {
    const { body, pulled } = streamedMegabyte();
    const response = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
    expect(pulled() * CHUNK).toBeLessThan(MO / 2);
  });

  it('passe un corps ordinaire à Better Auth', async () => {
    const response = await authRoutes.request('/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.fr', password: 'secret' }),
    });
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});
