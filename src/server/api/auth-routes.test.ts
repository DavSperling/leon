import { beforeEach, describe, expect, it, vi } from 'vitest';

const handler = vi.hoisted(() => vi.fn(async () => new Response('ok')));
vi.mock('@/server/auth/auth', () => ({ auth: { handler } }));

const { authRoutes } = await import('./auth-routes');

beforeEach(() => handler.mockClear());

// Audit du 26/10 n° 5 : seules les routes qu'un navigateur doit atteindre arrivent à Better Auth.
describe('/api/auth/*', () => {
  it('passe le lien de réinitialisation de l’e-mail à Better Auth', async () => {
    const response = await authRoutes.request('/reset-password/jeton?callbackURL=/reinitialiser');
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    ['POST', '/sign-in/email'],
    ['POST', '/change-password'],
    ['POST', '/update-user'],
    ['POST', '/organization/create'],
    ['POST', '/two-factor/disable'],
    ['GET', '/get-session'],
  ])('répond 404 à %s %s sans appeler Better Auth', async (method, path) => {
    const response = await authRoutes.request(path, { method });
    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
});
