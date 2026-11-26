import { describe, expect, it } from 'vitest';
import { auth } from './auth';

const call = (method: 'GET' | 'POST', path: string) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    }),
  );

// Audit du 26/11, n° 8 : ces routes de Better Auth contournaient les règles des server actions (l'image du profil,
// la limite d'essais du mot de passe, une seule organisation par personne, les rôles).
describe('les routes HTTP de Better Auth que l’appli n’utilise pas', () => {
  it.each([
    '/update-user',
    '/verify-password',
    '/change-email',
    '/delete-user',
    '/link-social',
    '/unlink-account',
    '/organization/create',
    '/organization/update',
    '/organization/delete',
    '/organization/leave',
    '/organization/set-active',
    '/organization/invite-member',
    '/organization/cancel-invitation',
    '/organization/accept-invitation',
    '/organization/reject-invitation',
    '/organization/remove-member',
    '/organization/update-member-role',
  ])('%s est fermée', async (path) => {
    expect((await call('POST', path)).status).toBe(404);
  });

  // Google One Tap la lit depuis le navigateur (google-one-tap.tsx).
  it('/get-session reste ouverte', async () => {
    expect((await call('GET', '/get-session')).status).toBe(200);
  });
});
