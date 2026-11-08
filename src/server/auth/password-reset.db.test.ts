import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminPool } from '@/test/db';
import { auth } from './auth';
import { createUserWithOrganization } from './sign-up';

// Resend « configuré » pour ce fichier : l'appel à l'API est intercepté, le lien est lu dans l'e-mail.
vi.mock('@/server/env', async (importOriginal) => {
  const { env } = await importOriginal<typeof import('@/server/env')>();
  return { env: { ...env, RESEND_API_KEY: 're_test', LEON_EMAIL_FROM: 'Leon <test@example.com>' } };
});

afterEach(() => vi.restoreAllMocks());

describe('réinitialisation du mot de passe', () => {
  it('envoie un lien qui sert une fois, dont la base ne garde que l’empreinte', async () => {
    const email = `paul-${randomUUID()}@example.com`;
    const created = await createUserWithOrganization({
      name: 'Paul Martin',
      email,
      password: 'ancien-motdepasse',
      organizationName: 'Dupont Rénovation',
    });
    if (!created.ok) throw new Error(`inscription refusée : ${created.error}`);
    const sent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    await auth.api.requestPasswordReset({ body: { email }, headers: new Headers() });

    // L'envoi part sans être attendu : la réponse ne dit pas, par son délai, si le compte existe.
    await vi.waitFor(() => expect(sent).toHaveBeenCalledOnce());
    const body = JSON.parse(String(sent.mock.calls[0]?.[1]?.body)) as { html: string };
    const token = /\/reset-password\/([^?"]+)/.exec(body.html)?.[1];
    if (!token) throw new Error('aucun lien dans l’e-mail');
    const { rows } = await adminPool.query<{ identifier: string }>(
      'select identifier from verification where value = $1',
      [created.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).not.toContain(token);

    await auth.api.resetPassword({ body: { token, newPassword: 'nouveau-motdepasse' } });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: 'autre-motdepasse' } }),
    ).rejects.toThrow();
    // Resend configuré : la connexion exige une adresse vérifiée (#119). Paul a suivi le lien de vérification.
    await adminPool.query('update "user" set "emailVerified" = true where id = $1', [
      created.userId,
    ]);
    await expect(
      auth.api.signInEmail({ body: { email, password: 'nouveau-motdepasse' } }),
    ).resolves.toMatchObject({ user: { email } });
  });
});
