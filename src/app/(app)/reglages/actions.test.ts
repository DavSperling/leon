import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { createInvitationLink } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { getSession, requireUserContext } from '@/server/auth/session';
import { saveAbout } from '@/server/briefing/about';
import {
  changePasswordAction,
  createInvitationAction,
  createTokenAction,
  disableTotpAction,
  enableTotpAction,
  regenerateBackupCodesAction,
  revokeTokenAction,
  setLocaleAction,
  updateAboutAction,
  updateProfileAction,
  verifyTotpSetupAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(),
  getSession: vi.fn(),
  requestHeaders: vi.fn(async () => new Headers()),
}));
vi.mock('@/server/auth/auth', () => ({
  auth: {
    api: {
      updateUser: vi.fn(),
      changePassword: vi.fn(),
      enableTwoFactor: vi.fn(),
      verifyTOTP: vi.fn(),
      revokeOtherSessions: vi.fn(),
      disableTwoFactor: vi.fn(),
      generateBackupCodes: vi.fn(),
    },
  },
}));
vi.mock('@/server/auth/rate-limit', () => ({ authAttemptAllowed: vi.fn() }));
vi.mock('@/server/auth/api-tokens', () => ({ createApiToken: vi.fn(), revokeApiToken: vi.fn() }));
vi.mock('@/server/auth/members', () => ({ createInvitationLink: vi.fn() }));
vi.mock('@/server/briefing/about', () => ({ ABOUT_MAX_CHARS: 500, saveAbout: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const setCookie = vi.fn();
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: setCookie })) }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const TOKEN_ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const SECRET = 'leon_jeton-de-test-qui-ne-doit-jamais-etre-journalise';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
  vi.mocked(getSession).mockResolvedValue({ user: { email: 'amos@example.com' } } as never);
  vi.mocked(authAttemptAllowed).mockResolvedValue(true);
});

describe('changePasswordAction', () => {
  it('change le mot de passe et ferme les autres sessions', async () => {
    await expect(changePasswordAction('ancien-mdp', 'nouveau-mdp', 'nouveau-mdp')).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(auth.api.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          currentPassword: 'ancien-mdp',
          newPassword: 'nouveau-mdp',
          revokeOtherSessions: true,
        },
      }),
    );
  });

  it('refuse un mot de passe trop court ou mal confirmé sans appeler Better Auth', async () => {
    await expect(changePasswordAction('ancien-mdp', 'court', 'court')).resolves.toHaveProperty(
      'error',
    );
    await expect(
      changePasswordAction('ancien-mdp', 'nouveau-mdp', 'autre-mdp'),
    ).resolves.toHaveProperty('error');
    expect(auth.api.changePassword).not.toHaveBeenCalled();
  });

  it('compte dans la limite de la connexion, et rend une erreur sur un mauvais mot de passe actuel', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);
    await expect(changePasswordAction('x', 'nouveau-mdp', 'nouveau-mdp')).resolves.toEqual({
      error: expect.any(String),
    });
    expect(auth.api.changePassword).not.toHaveBeenCalled();

    vi.mocked(authAttemptAllowed).mockResolvedValue(true);
    vi.mocked(auth.api.changePassword).mockRejectedValue(new Error('INVALID_PASSWORD'));
    await expect(
      changePasswordAction('faux', 'nouveau-mdp', 'nouveau-mdp'),
    ).resolves.toHaveProperty('error');
  });
});

describe('double authentification', () => {
  it('ferme les autres sessions une fois le code de l’application confirmé', async () => {
    await expect(verifyTotpSetupAction('123456')).resolves.toEqual({ ok: true });

    expect(auth.api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: '123456' } }),
    );
    expect(auth.api.revokeOtherSessions).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it('ne ferme rien quand le code est refusé ou mal formé', async () => {
    vi.mocked(auth.api.verifyTOTP).mockRejectedValue(new Error('INVALID_CODE'));

    expect(await verifyTotpSetupAction('000000')).toEqual({ error: expect.any(String) });
    expect(await verifyTotpSetupAction('12a')).toEqual({ error: expect.any(String) });

    expect(auth.api.verifyTOTP).toHaveBeenCalledTimes(1);
    expect(auth.api.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it.each([
    ['activer', () => enableTotpAction('x'), () => auth.api.enableTwoFactor],
    ['désactiver', () => disableTotpAction('x'), () => auth.api.disableTwoFactor],
    [
      'régénérer les codes',
      () => regenerateBackupCodesAction('x'),
      () => auth.api.generateBackupCodes,
    ],
  ])(
    'compte l’essai de mot de passe pour %s, et s’arrête à la limite',
    async (_label, run, api) => {
      vi.mocked(authAttemptAllowed).mockResolvedValue(false);

      expect(await run()).toEqual({ error: expect.any(String) });

      expect(authAttemptAllowed).toHaveBeenCalledWith(
        'connexion',
        'amos@example.com',
        expect.any(Headers),
      );
      expect(api()).not.toHaveBeenCalled();
    },
  );

  it('rend les nouveaux codes de secours', async () => {
    vi.mocked(auth.api.generateBackupCodes).mockResolvedValue({
      status: true,
      backupCodes: ['aaaaa-bbbbb'],
    });

    expect(await regenerateBackupCodesAction('motdepasse')).toEqual({
      backupCodes: ['aaaaa-bbbbb'],
    });
  });
});

const localeForm = (locale: string) => {
  const data = new FormData();
  data.set('locale', locale);
  return data;
};

describe('setLocaleAction', () => {
  it('pose le cookie de langue, et ignore une langue inconnue', async () => {
    await setLocaleAction(localeForm('fr'));
    expect(setCookie).toHaveBeenCalledWith(
      'leon-locale',
      'fr',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');

    vi.clearAllMocks();
    await setLocaleAction(localeForm('de'));
    expect(cookies).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe('updateAboutAction', () => {
  it('enregistre le texte sans ses blancs, et efface quand il est vide', async () => {
    await expect(updateAboutAction('  Lead back-end.  ')).resolves.toEqual({ ok: true });
    expect(saveAbout).toHaveBeenCalledWith(ctx, 'Lead back-end.');
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');

    await updateAboutAction('   ');
    expect(saveAbout).toHaveBeenLastCalledWith(ctx, null);
  });

  it('refuse un texte de plus de 500 caractères, et rend une erreur quand la base refuse', async () => {
    const tooLong = await updateAboutAction('x'.repeat(501));
    expect(tooLong).toHaveProperty('error');
    expect(saveAbout).not.toHaveBeenCalled();

    vi.mocked(saveAbout).mockRejectedValue(new Error('refus'));
    await expect(updateAboutAction('Lead back-end.')).resolves.toHaveProperty('error');
  });
});

describe('updateProfileAction', () => {
  it('rend une erreur au lieu de planter quand Better Auth refuse', async () => {
    vi.mocked(auth.api.updateUser).mockRejectedValue(new Error('refus'));

    expect(await updateProfileAction('Amos')).toEqual({ error: expect.any(String) });
    expect(await updateProfileAction('   ')).toEqual({ error: expect.any(String) });
    expect(auth.api.updateUser).toHaveBeenCalledTimes(1);
  });
});

describe('createTokenAction', () => {
  it('crée le jeton pour le lecteur connecté, nom nettoyé, et le renvoie une seule fois', async () => {
    vi.mocked(createApiToken).mockResolvedValue({ id: TOKEN_ID, token: SECRET, hint: 'ee3a' });

    await expect(createTokenAction('  MacBook Amos  ')).resolves.toEqual({
      token: SECRET,
      hint: 'ee3a',
    });

    expect(createApiToken).toHaveBeenCalledWith(ctx, 'MacBook Amos');
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it("n'écrit le jeton dans aucun journal", async () => {
    vi.mocked(createApiToken).mockResolvedValue({ id: TOKEN_ID, token: SECRET, hint: 'ee3a' });
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );

    await createTokenAction('MacBook Amos');

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    for (const spy of spies) spy.mockRestore();
  });

  it.each([
    ['vide', ''],
    ['fait d’espaces', '   '],
    ['de plus de 80 caractères', 'a'.repeat(81)],
  ])('refuse un nom %s, sans créer de jeton', async (_label, name) => {
    const result = await createTokenAction(name);

    expect(result).toEqual({ error: expect.stringContaining('nom') });
    expect(createApiToken).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('accepte un nom de 80 caractères', async () => {
    vi.mocked(createApiToken).mockResolvedValue({ id: TOKEN_ID, token: SECRET, hint: 'ee3a' });

    await expect(createTokenAction('a'.repeat(80))).resolves.toHaveProperty('token');
  });

  it('ne crée rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(createTokenAction('MacBook')).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(createApiToken).not.toHaveBeenCalled();
  });
});

describe('revokeTokenAction', () => {
  it('révoque le jeton du lecteur connecté puis rafraîchit la liste', async () => {
    vi.mocked(revokeApiToken).mockResolvedValue(true);

    await expect(revokeTokenAction(TOKEN_ID)).resolves.toEqual({ ok: true });

    expect(revokeApiToken).toHaveBeenCalledWith(ctx, TOKEN_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it("rend { ok: false } quand le jeton n'est pas au lecteur ou déjà révoqué", async () => {
    vi.mocked(revokeApiToken).mockResolvedValue(false);

    await expect(revokeTokenAction(TOKEN_ID)).resolves.toEqual({ ok: false });
  });

  it("rend { ok: false } pour un identifiant qui n'est pas un UUID, sans rien révoquer", async () => {
    await expect(revokeTokenAction('pas-un-uuid')).resolves.toEqual({ ok: false });

    expect(revokeApiToken).not.toHaveBeenCalled();
  });

  it('ne révoque rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(revokeTokenAction(TOKEN_ID)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(revokeApiToken).not.toHaveBeenCalled();
  });
});

describe('createInvitationAction', () => {
  it("rend l'adresse du lien sur l'instance, une seule fois", async () => {
    const expiresAt = new Date('2026-11-01T10:00:00Z');
    vi.mocked(createInvitationLink).mockResolvedValue({ token: 'abc_-123', expiresAt });

    await expect(createInvitationAction()).resolves.toEqual({
      url: 'http://localhost:3000/invitation/abc_-123',
      expiresAt,
    });
    expect(createInvitationLink).toHaveBeenCalledWith(ctx);
  });

  it("refuse qui n'est ni propriétaire ni administrateur", async () => {
    vi.mocked(createInvitationLink).mockResolvedValue(null);

    await expect(createInvitationAction()).resolves.toEqual({
      error: expect.stringContaining('administrateurs'),
    });
  });
});
