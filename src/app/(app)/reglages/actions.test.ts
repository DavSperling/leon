import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { DeletionRefused, deleteAccount, deleteOrganization } from '@/server/auth/delete-account';
import { createInvitationLink } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { getSession, requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { saveAbout } from '@/server/briefing/about';
import { forgetPipedreamUser } from '@/server/connectors/pipedream';
import { sendDeletionEmail } from '@/server/email/account-deleted';
import { logError } from '@/server/log';
import fr from '../../../../messages/fr.json';
import {
  changePasswordAction,
  createInvitationAction,
  createTokenAction,
  deleteAccountAction,
  deleteOrganizationAction,
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
  signOutCurrentUser: vi.fn(),
}));
vi.mock('@/server/auth/auth', () => ({
  auth: {
    api: {
      updateUser: vi.fn(),
      changePassword: vi.fn(),
      enableTwoFactor: vi.fn(),
      verifyPassword: vi.fn(),
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
// La vraie classe est dans un module qui ouvre la base : la copie suffit à `instanceof`, puisque les actions et le
// test lisent la même.
vi.mock('@/server/auth/delete-account', () => ({
  DeletionRefused: class extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
  deleteAccount: vi.fn(),
  deleteOrganization: vi.fn(),
}));
vi.mock('@/server/connectors/pipedream', () => ({ forgetPipedreamUser: vi.fn() }));
vi.mock('@/server/email/account-deleted', () => ({ sendDeletionEmail: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const setCookie = vi.fn();
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: setCookie })) }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const TOKEN_ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const SECRET = 'leon_jeton-de-test-qui-ne-doit-jamais-etre-journalise';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
  vi.mocked(getSession).mockResolvedValue({
    user: { email: 'amos@example.com', twoFactorEnabled: false },
  } as never);
  vi.mocked(authAttemptAllowed).mockResolvedValue(true);
  // clearAllMocks garde les refus programmés par un test précédent.
  vi.mocked(auth.api.verifyPassword).mockResolvedValue({ status: true });
  vi.mocked(auth.api.verifyTOTP).mockResolvedValue(undefined as never);
  vi.mocked(forgetPipedreamUser).mockResolvedValue(undefined);
  vi.mocked(sendDeletionEmail).mockResolvedValue(undefined);
  vi.mocked(signOutCurrentUser).mockResolvedValue(undefined);
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

// Les deux actions confirment l'identité de la même façon, puis appellent le module de suppression.
const done = {
  organizationDeleted: false,
  organizationName: 'Dupont Rénovation',
  notify: [{ email: 'amos@example.com', kind: 'account' as const }],
  pipedreamUsers: ['pd-1', 'pd-2'],
};
const identity = { password: 'motdepasse', code: '123456', word: 'SUPPRIMER' };
const SUCCESSOR_ID = '5c1d8e0a-7b3f-4a62-8d19-0e4f6a7b8c9d';

describe.each([
  {
    name: 'deleteAccountAction',
    run: (input: Partial<typeof identity> = {}) =>
      deleteAccountAction({ ...identity, ...input, successorId: null, organizationToo: false }),
    deletion: () => vi.mocked(deleteAccount),
    callArgs: [ctx, null, false],
    redirectTo: '/connexion?supprime=compte',
  },
  {
    name: 'deleteOrganizationAction',
    run: (input: Partial<typeof identity> = {}) =>
      deleteOrganizationAction({ ...identity, ...input }),
    deletion: () => vi.mocked(deleteOrganization),
    callArgs: [ctx],
    redirectTo: '/connexion?supprime=organisation',
  },
])('$name', ({ run, deletion, callArgs, redirectTo }) => {
  beforeEach(() => {
    deletion().mockResolvedValue(done);
  });

  const twoFactor = () =>
    vi.mocked(getSession).mockResolvedValue({
      user: { email: 'amos@example.com', twoFactorEnabled: true },
    } as never);

  it.each([
    [
      'un mot mal tapé',
      () => run({ word: 'supprimer' }),
      fr.deleteAccount.wrongWord.replace('{word}', fr.deleteAccount.word),
    ],
    [
      'un mauvais mot de passe',
      () => {
        vi.mocked(auth.api.verifyPassword).mockRejectedValue(new Error('INVALID_PASSWORD'));
        return run();
      },
      fr.security.wrongPassword,
    ],
    [
      'un mauvais code 2FA',
      () => {
        twoFactor();
        vi.mocked(auth.api.verifyTOTP).mockRejectedValue(new Error('INVALID_CODE'));
        return run();
      },
      fr.deleteAccount.wrongCode,
    ],
    [
      'au-delà de la limite d’essais',
      () => {
        vi.mocked(authAttemptAllowed).mockResolvedValue(false);
        return run();
      },
      fr.security.tooManyAttempts,
    ],
  ])('refuse %s, sans rien supprimer', async (_label, attempt, error) => {
    await expect(attempt()).resolves.toEqual({ error });

    expect(deletion()).not.toHaveBeenCalled();
    expect(sendDeletionEmail).not.toHaveBeenCalled();
    expect(forgetPipedreamUser).not.toHaveBeenCalled();
    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });

  it('compte l’essai dans la limite de la connexion, avant de lire le mot de passe', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);

    await run();

    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'connexion',
      'amos@example.com',
      expect.any(Headers),
    );
    expect(auth.api.verifyPassword).not.toHaveBeenCalled();
  });

  it('supprime, prévient Pipedream, envoie l’e-mail, ferme la session et redirige', async () => {
    deletion().mockResolvedValue({
      ...done,
      notify: [
        { email: 'amos@example.com', kind: 'account' },
        { email: 'paul@example.com', kind: 'organization' },
      ],
    });

    // Le mot tapé se lit sans ses blancs ; sans 2FA, aucun code n'est demandé.
    await expect(run({ word: ' SUPPRIMER ' })).rejects.toThrow(`NEXT_REDIRECT ${redirectTo}`);

    expect(auth.api.verifyPassword).toHaveBeenCalledWith(
      expect.objectContaining({ body: { password: 'motdepasse' } }),
    );
    expect(auth.api.verifyTOTP).not.toHaveBeenCalled();
    expect(deletion()).toHaveBeenCalledWith(...callArgs);
    expect(forgetPipedreamUser).toHaveBeenCalledTimes(2);
    expect(forgetPipedreamUser).toHaveBeenCalledWith('pd-1');
    expect(forgetPipedreamUser).toHaveBeenCalledWith('pd-2');
    expect(sendDeletionEmail).toHaveBeenCalledWith({
      to: 'amos@example.com',
      locale: 'fr',
      kind: 'account',
      organizationName: 'Dupont Rénovation',
    });
    expect(sendDeletionEmail).toHaveBeenCalledWith({
      to: 'paul@example.com',
      locale: 'fr',
      kind: 'organization',
      organizationName: 'Dupont Rénovation',
    });
    expect(signOutCurrentUser).toHaveBeenCalled();
  });

  it('demande le code de l’application quand la 2FA est activée', async () => {
    twoFactor();

    await expect(run()).rejects.toThrow('NEXT_REDIRECT');

    expect(auth.api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: '123456' } }),
    );
  });

  it('une panne de Pipedream, de Resend ou de la fermeture de session n’empêche pas la redirection', async () => {
    vi.mocked(forgetPipedreamUser).mockRejectedValue(new Error('pipedream'));
    vi.mocked(sendDeletionEmail).mockRejectedValue(new Error('resend'));
    vi.mocked(signOutCurrentUser).mockRejectedValue(new Error('session déjà partie'));

    await expect(run()).rejects.toThrow(`NEXT_REDIRECT ${redirectTo}`);

    expect(logError).toHaveBeenCalledWith('account.deletion_email', expect.any(Error));
  });

  // Resend limite à 2 requêtes par seconde : un message après l'autre, et un échec n'arrête pas les suivants.
  it("envoie les e-mails l'un après l'autre, espacés pour Resend, et un échec n'empêche pas les suivants", async () => {
    deletion().mockResolvedValue({
      ...done,
      notify: ['a', 'b', 'c'].map((name) => ({
        email: `${name}@example.com`,
        kind: 'organization' as const,
      })),
    });
    const events: string[] = [];
    const starts: number[] = [];
    vi.mocked(sendDeletionEmail).mockImplementation(async ({ to }) => {
      events.push(`début ${to}`);
      starts.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`fin ${to}`);
      if (to === 'b@example.com') throw new Error('resend');
    });

    vi.useFakeTimers();
    try {
      const done = expect(run()).rejects.toThrow(`NEXT_REDIRECT ${redirectTo}`);
      await vi.runAllTimersAsync();
      await done;
    } finally {
      vi.useRealTimers();
    }

    const gaps = starts.slice(1).map((start, index) => start - (starts[index] ?? start));
    expect(gaps).toHaveLength(2);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(500);
    expect(events).toEqual([
      'début a@example.com',
      'fin a@example.com',
      'début b@example.com',
      'fin b@example.com',
      'début c@example.com',
      'fin c@example.com',
    ]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('account.deletion_email', expect.any(Error));
  });

  it.each([
    ['un mot de passe qui n’est pas un texte', { password: 42 }],
    ['un code absent', { code: undefined }],
    ['un mot qui n’est pas un texte', { word: null }],
  ])('rend un message général pour %s, sans rien vérifier ni supprimer', async (_label, bad) => {
    await expect(run(bad as never)).resolves.toEqual({ error: fr.deleteAccount.failed });

    expect(auth.api.verifyPassword).not.toHaveBeenCalled();
    expect(deletion()).not.toHaveBeenCalled();
    expect(sendDeletionEmail).not.toHaveBeenCalled();
  });

  it('rend le refus du module, sans prévenir personne', async () => {
    deletion().mockRejectedValue(new DeletionRefused('pas_proprietaire'));

    await expect(run()).resolves.toEqual({ error: fr.deleteAccount.refused.pas_proprietaire });

    expect(sendDeletionEmail).not.toHaveBeenCalled();
    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });

  it('rend un message général, et le journal, quand la suppression échoue autrement', async () => {
    // Un second envoi du même formulaire : la première suppression a déjà retiré la personne.
    deletion().mockRejectedValue(new Error('Membre actif introuvable'));

    await expect(run()).resolves.toEqual({ error: fr.deleteAccount.failed });

    expect(logError).toHaveBeenCalledWith('account.deletion_failed', expect.any(Error));
    expect(sendDeletionEmail).not.toHaveBeenCalled();
  });
});

describe('deleteAccountAction', () => {
  it('passe le successeur choisi au module, et rend le refus d’un successeur invalide', async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new DeletionRefused('successeur'));

    await expect(
      deleteAccountAction({ ...identity, successorId: SUCCESSOR_ID, organizationToo: false }),
    ).resolves.toEqual({ error: fr.deleteAccount.refused.successeur });

    expect(deleteAccount).toHaveBeenCalledWith(ctx, SUCCESSOR_ID, false);
  });

  // Le dialogue envoie ce qu'il a montré : le module refuse si l'équipe a changé depuis.
  it('passe au module si le dialogue annonçait l’organisation supprimée, et rend son refus', async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new DeletionRefused('situation'));

    await expect(
      deleteAccountAction({ ...identity, successorId: null, organizationToo: true }),
    ).resolves.toEqual({ error: fr.deleteAccount.refused.situation });

    expect(deleteAccount).toHaveBeenCalledWith(ctx, null, true);
    expect(sendDeletionEmail).not.toHaveBeenCalled();
    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });

  it.each([
    [
      'un successeur qui n’est pas un identifiant',
      { successorId: 'collegue', organizationToo: false },
    ],
    ['un successeur absent', { successorId: undefined, organizationToo: false }],
    [
      'un choix d’organisation qui n’est pas un booléen',
      { successorId: null, organizationToo: 'oui' },
    ],
    ['un choix d’organisation absent', { successorId: null }],
  ])('rend un message général pour %s, sans rien vérifier ni supprimer', async (_label, bad) => {
    await expect(deleteAccountAction({ ...identity, ...bad } as never)).resolves.toEqual({
      error: fr.deleteAccount.failed,
    });

    expect(auth.api.verifyPassword).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
