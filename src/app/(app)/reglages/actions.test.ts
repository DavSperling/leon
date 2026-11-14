import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { DeletionRefused, deleteAccount, deleteOrganization } from '@/server/auth/delete-account';
import { createInvitationLink, setMemberPlacement, setNotesRefused } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import {
  getSession,
  requireUserContext,
  signedInRecently,
  signOutCurrentUser,
} from '@/server/auth/session';
import { saveAbout } from '@/server/briefing/about';
import { setDepotEquipe } from '@/server/connectors/github/depots-equipe';
import { forgetPipedreamUser } from '@/server/connectors/pipedream';
import { sendDeletionEmails } from '@/server/email/account-deleted';
import { logError } from '@/server/log';
import { correctLesson, retireLesson, writeLesson } from '@/server/memory/lessons';
import { readMemoryVersion, restoreMemoryVersion } from '@/server/memory/memory-section';
import fr from '../../../../messages/fr.json';
import {
  changePasswordAction,
  correctLessonAction,
  createInvitationAction,
  createTokenAction,
  deleteAccountAction,
  deleteOrganizationAction,
  disableTotpAction,
  enableTotpAction,
  readMemoryVersionAction,
  regenerateBackupCodesAction,
  restoreMemoryVersionAction,
  retireLessonAction,
  revokeTokenAction,
  setDepotEquipeAction,
  setLocaleAction,
  setMemberPlacementAction,
  setNotesOpenAction,
  updateAboutAction,
  updateProfileAction,
  verifyTotpSetupAction,
  writeLessonAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(),
  getSession: vi.fn(),
  signedInRecently: vi.fn(),
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
vi.mock('@/server/auth/members', () => ({
  createInvitationLink: vi.fn(),
  setMemberPlacement: vi.fn(),
  setNotesRefused: vi.fn(),
}));
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
vi.mock('@/server/connectors/github/depots-equipe', () => ({ setDepotEquipe: vi.fn() }));
vi.mock('@/server/memory/lessons', () => ({
  correctLesson: vi.fn(),
  retireLesson: vi.fn(),
  writeLesson: vi.fn(),
}));
vi.mock('@/server/memory/memory-section', () => ({
  readMemoryVersion: vi.fn(),
  restoreMemoryVersion: vi.fn(),
}));
vi.mock('@/server/connectors/pipedream', () => ({ forgetPipedreamUser: vi.fn() }));
vi.mock('@/server/email/account-deleted', () => ({
  RESEND_BATCH_MAX: 100,
  sendDeletionEmails: vi.fn(),
}));
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
  vi.mocked(sendDeletionEmails).mockResolvedValue(undefined);
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

  // Le nom paraît dans la barre latérale et le menu de la personne : la mise en page entière se relit.
  it('enregistre le nom nettoyé et relit toute la mise en page', async () => {
    vi.mocked(auth.api.updateUser).mockResolvedValue({ status: true } as never);

    expect(await updateProfileAction('  Amos  ')).toEqual({ ok: true });
    expect(auth.api.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Amos' } }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
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

const backend = { department: 'engineering', job: 'backend', seniority: '3' };

describe('createInvitationAction', () => {
  const expiresAt = new Date('2026-11-01T10:00:00Z');

  it('crée un lien qui porte le nom et le poste', async () => {
    vi.mocked(createInvitationLink).mockResolvedValue({ token: 't'.repeat(43), expiresAt });

    const result = await createInvitationAction({ name: '  Inès ', ...backend });

    expect(createInvitationLink).toHaveBeenCalledWith(ctx, {
      name: 'Inès',
      placement: { department: 'engineering', job: 'backend', seniority: 3 },
    });
    expect(result).toEqual({
      url: `http://localhost:3000/invitation/${'t'.repeat(43)}`,
      expiresAt,
    });
  });

  it("porte le manager choisi sur l'écran Équipe, et refuse un identifiant forgé", async () => {
    vi.mocked(createInvitationLink).mockResolvedValue({ token: 't'.repeat(43), expiresAt });
    const managerId = '11111111-1111-4111-8111-111111111111';

    await createInvitationAction({ name: '', ...backend, managerId });
    expect(createInvitationLink).toHaveBeenCalledWith(ctx, {
      name: '',
      placement: { department: 'engineering', job: 'backend', seniority: 3 },
      managerId,
    });
    expect(await createInvitationAction({ name: '', ...backend, managerId: 'x' })).toEqual({
      errors: { form: 'form' },
    });
  });

  it.each([
    [{ department: 'sales', job: 'backend', seniority: '3' }, 'job'],
    [{ department: 'toString', job: 'backend', seniority: '3' }, 'department'],
    [{ ...backend, seniority: '0' }, 'seniority'],
    [{ ...backend, seniority: '9' }, 'seniority'],
  ])('refuse un poste incohérent sans rien créer (%o → %s)', async (input, field) => {
    expect(await createInvitationAction({ name: '', ...input })).toEqual({
      errors: { [field]: field },
    });
    expect(createInvitationLink).not.toHaveBeenCalled();
  });

  it('refuse un nom de 101 caractères', async () => {
    expect(await createInvitationAction({ name: 'a'.repeat(101), ...backend })).toEqual({
      errors: { name: 'name' },
    });
    expect(createInvitationLink).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'poste'])(
    'refuse un argument forgé (%o) sans planter ni rien créer',
    async (input) => {
      expect(await createInvitationAction(input as never)).toEqual({ errors: { form: 'form' } });
      expect(createInvitationLink).not.toHaveBeenCalled();
    },
  );

  it("signale chaque champ manquant d'un objet incomplet", async () => {
    expect(await createInvitationAction({} as never)).toEqual({
      errors: { name: 'name', department: 'department', job: 'job', seniority: 'seniority' },
    });
    expect(createInvitationLink).not.toHaveBeenCalled();
  });

  it("dit qu'il faut être administrateur quand le lien est refusé", async () => {
    vi.mocked(createInvitationLink).mockResolvedValue(null);

    expect(await createInvitationAction({ name: '', ...backend })).toEqual({
      errors: { form: 'permission' },
    });
  });
});

describe('setMemberPlacementAction', () => {
  it("fixe le poste d'un membre", async () => {
    vi.mocked(setMemberPlacement).mockResolvedValue(true);

    expect(await setMemberPlacementAction(TOKEN_ID, backend)).toEqual({ ok: true });
    expect(setMemberPlacement).toHaveBeenCalledWith(ctx, TOKEN_ID, {
      department: 'engineering',
      job: 'backend',
      seniority: 3,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it("refuse un identifiant de membre qui n'est pas un UUID", async () => {
    expect(await setMemberPlacementAction('abc', backend)).toEqual({ errors: { form: 'form' } });
    expect(setMemberPlacement).not.toHaveBeenCalled();
  });

  it('refuse un poste incohérent sans rien écrire', async () => {
    expect(await setMemberPlacementAction(TOKEN_ID, { ...backend, department: 'sales' })).toEqual({
      errors: { job: 'job' },
    });
    expect(setMemberPlacement).not.toHaveBeenCalled();
  });

  it('refuse un argument forgé sans planter ni rien écrire', async () => {
    expect(await setMemberPlacementAction(TOKEN_ID, null as never)).toEqual({
      errors: { form: 'form' },
    });
    expect(setMemberPlacement).not.toHaveBeenCalled();
  });

  it("dit qu'il faut être administrateur quand la modification est refusée", async () => {
    vi.mocked(setMemberPlacement).mockResolvedValue(false);

    expect(await setMemberPlacementAction(TOKEN_ID, backend)).toEqual({
      errors: { form: 'permission' },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('setDepotEquipeAction', () => {
  it('coche ou décoche le dépôt pour le lecteur connecté, puis rafraîchit la liste', async () => {
    vi.mocked(setDepotEquipe).mockResolvedValue('ok');

    expect(await setDepotEquipeAction('Org/Repo', true)).toEqual({ ok: true });
    expect(await setDepotEquipeAction('org/repo', false)).toEqual({ ok: true });

    expect(setDepotEquipe).toHaveBeenNthCalledWith(1, ctx, 'Org/Repo', true);
    expect(setDepotEquipe).toHaveBeenNthCalledWith(2, ctx, 'org/repo', false);
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it.each([
    ['invalide', fr.settings.depotInvalid],
    ['refuse', fr.settings.depotRefused],
    ['illisible', fr.settings.depotUnreadable],
  ] as const)('dit pourquoi le module refuse (%s), sans rafraîchir', async (refus, message) => {
    vi.mocked(setDepotEquipe).mockResolvedValue(refus);

    expect(await setDepotEquipeAction('acme', true)).toEqual({ error: message });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // Le message d'une erreur de requête porte ses paramètres, donc le dépôt : il passe par logError, qui le masque.
  it('rend un message général, et le journal, quand la base échoue', async () => {
    vi.mocked(setDepotEquipe).mockRejectedValue(
      new Error('Failed query: params: github.com/acme/app'),
    );

    expect(await setDepotEquipeAction('acme/app', true)).toEqual({
      error: fr.settings.depotFailed,
    });

    expect(logError).toHaveBeenCalledExactlyOnceWith('settings.depot_failed', expect.any(Error));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [null, true],
    ['acme/app', 'oui'],
  ])('refuse un argument forgé (%o, %o) sans rien écrire', async (depot, coche) => {
    expect(await setDepotEquipeAction(depot as never, coche as never)).toEqual({
      error: fr.settings.depotInvalid,
    });
    expect(setDepotEquipe).not.toHaveBeenCalled();
  });

  it('ne fait rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(setDepotEquipeAction('acme/app', true)).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );

    expect(setDepotEquipe).not.toHaveBeenCalled();
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
    expect(sendDeletionEmails).not.toHaveBeenCalled();
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
    expect(sendDeletionEmails).toHaveBeenCalledExactlyOnceWith({
      recipients: [
        { email: 'amos@example.com', kind: 'account' },
        { email: 'paul@example.com', kind: 'organization' },
      ],
      locale: 'fr',
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
    vi.mocked(sendDeletionEmails).mockRejectedValue(new Error('resend'));
    vi.mocked(signOutCurrentUser).mockRejectedValue(new Error('session déjà partie'));

    await expect(run()).rejects.toThrow(`NEXT_REDIRECT ${redirectTo}`);

    expect(logError).toHaveBeenCalledWith('account.deletion_email', expect.any(Error));
  });

  // Une requête par lot de 100 ; Resend limite à 2 requêtes par seconde : un lot après l'autre, et un échec
  // n'arrête pas les suivants.
  it("envoie les e-mails par lots de 100, espacés pour Resend, et un échec n'empêche pas les suivants", async () => {
    deletion().mockResolvedValue({
      ...done,
      notify: Array.from({ length: 250 }, (_, index) => ({
        email: `m${index}@example.com`,
        kind: 'organization' as const,
      })),
    });
    const events: string[] = [];
    const starts: number[] = [];
    vi.mocked(sendDeletionEmails).mockImplementation(async ({ recipients }) => {
      const first = recipients[0]?.email;
      events.push(`début ${first} (${recipients.length})`);
      starts.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`fin ${first}`);
      if (first === 'm100@example.com') throw new Error('resend');
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
      'début m0@example.com (100)',
      'fin m0@example.com',
      'début m100@example.com (100)',
      'fin m100@example.com',
      'début m200@example.com (50)',
      'fin m200@example.com',
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
    expect(sendDeletionEmails).not.toHaveBeenCalled();
  });

  it('rend le refus du module, sans prévenir personne', async () => {
    deletion().mockRejectedValue(new DeletionRefused('pas_proprietaire'));

    await expect(run()).resolves.toEqual({ error: fr.deleteAccount.refused.pas_proprietaire });

    expect(sendDeletionEmails).not.toHaveBeenCalled();
    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });

  it('rend un message général, et le journal, quand la suppression échoue autrement', async () => {
    // Un second envoi du même formulaire : la première suppression a déjà retiré la personne.
    deletion().mockRejectedValue(new Error('Membre actif introuvable'));

    await expect(run()).resolves.toEqual({ error: fr.deleteAccount.failed });

    expect(logError).toHaveBeenCalledWith('account.deletion_failed', expect.any(Error));
    expect(sendDeletionEmails).not.toHaveBeenCalled();
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
    expect(sendDeletionEmails).not.toHaveBeenCalled();
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

// La section Mémoire (T55 ; D33, D34, D37, C12, C13 du plan de la mémoire à disposition) : sous la session du navigateur
// seulement (requireUserContext). Écrire, corriger et remettre exigent une connexion de moins d'une heure, retirer non.
// Les cas en base (v4 après v3, la version d'un collègue, un fil absorbé, une version illisible) sont dans
// src/server/memory/memory-section.db.test.ts.
describe('les actions de la section Mémoire', () => {
  const LECON = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5e';
  const FIL = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5f';
  const writers = () => [writeLesson, correctLesson, restoreMemoryVersion].map(vi.mocked);

  beforeEach(() => {
    vi.mocked(signedInRecently).mockResolvedValue(true);
  });

  it('écrire une leçon : le texte et le dépôt choisi, ou tous mes dépôts', async () => {
    vi.mocked(writeLesson).mockResolvedValue({ id: LECON, n: 1 });

    await expect(
      writeLessonAction({ texte: 'Relancer les tests.', projet: 'github.com/acme/leon' }),
    ).resolves.toEqual({ ok: true, id: LECON, n: 1 });
    await writeLessonAction({ texte: 'Écrire en français.', projet: null });

    expect(vi.mocked(writeLesson).mock.calls).toEqual([
      [ctx, { texte: 'Relancer les tests.', projet: 'github.com/acme/leon' }],
      [ctx, { texte: 'Écrire en français.', projet: undefined }],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it('corriger une leçon : une nouvelle version, depuis celle lue ; dépassée, « modifiée entre-temps »', async () => {
    vi.mocked(correctLesson).mockResolvedValueOnce({ n: 2 }).mockResolvedValueOnce('depassee');
    const input = { id: LECON, texte: 'Relancer les tests en base.', depuis: 1 };

    await expect(correctLessonAction(input)).resolves.toEqual({ ok: true, n: 2 });
    await expect(correctLessonAction(input)).resolves.toEqual({ error: 'modifiee' });

    expect(correctLesson).toHaveBeenCalledWith(ctx, input);
  });

  it('remettre une version d’un fil ou d’une leçon ; dépassée, « modifiée entre-temps »', async () => {
    vi.mocked(restoreMemoryVersion)
      .mockResolvedValueOnce({ n: 4 })
      .mockResolvedValueOnce('depassee')
      .mockResolvedValueOnce('introuvable');
    const fil = { cible: 'fil' as const, id: FIL, n: 1, depuis: 3 };

    await expect(restoreMemoryVersionAction(fil)).resolves.toEqual({ ok: true, n: 4 });
    await expect(restoreMemoryVersionAction(fil)).resolves.toEqual({ error: 'modifiee' });
    await expect(
      restoreMemoryVersionAction({ cible: 'lecon', id: LECON, n: 1, depuis: 2 }),
    ).resolves.toEqual({ error: 'introuvable' });

    expect(vi.mocked(restoreMemoryVersion).mock.calls).toEqual([
      [ctx, fil],
      [ctx, fil],
      [ctx, { cible: 'lecon', id: LECON, n: 1, depuis: 2 }],
    ]);
  });

  it('remettre une version d’une note : la cible note, dépassée « modifiée entre-temps »', async () => {
    vi.mocked(restoreMemoryVersion)
      .mockResolvedValueOnce({ n: 3 })
      .mockResolvedValueOnce('depassee');
    const note = { cible: 'note' as const, id: FIL, n: 1, depuis: 2 };

    await expect(restoreMemoryVersionAction(note)).resolves.toEqual({ ok: true, n: 3 });
    await expect(restoreMemoryVersionAction(note)).resolves.toEqual({ error: 'modifiee' });

    expect(vi.mocked(restoreMemoryVersion).mock.calls).toEqual([
      [ctx, note],
      [ctx, note],
    ]);
  });

  it('avec une session de plus d’une heure, remettre une note donne « reconnexion », sans rien écrire', async () => {
    vi.mocked(signedInRecently).mockResolvedValue(false);

    await expect(
      restoreMemoryVersionAction({ cible: 'note', id: FIL, n: 1, depuis: 2 }),
    ).resolves.toEqual({ error: 'reconnexion' });

    expect(restoreMemoryVersion).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('avec une session de plus d’une heure, écrire, corriger ou remettre donne « reconnexion », sans rien écrire', async () => {
    vi.mocked(signedInRecently).mockResolvedValue(false);

    await expect(writeLessonAction({ texte: 'Bien.', projet: null })).resolves.toEqual({
      error: 'reconnexion',
    });
    await expect(correctLessonAction({ id: LECON, texte: 'Bien.', depuis: 1 })).resolves.toEqual({
      error: 'reconnexion',
    });
    await expect(
      restoreMemoryVersionAction({ cible: 'fil', id: FIL, n: 1, depuis: 3 }),
    ).resolves.toEqual({ error: 'reconnexion' });

    for (const writer of writers()) expect(writer).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('retirer une leçon n’exige pas une connexion récente', async () => {
    vi.mocked(signedInRecently).mockResolvedValue(false);
    vi.mocked(retireLesson).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(retireLessonAction(LECON)).resolves.toEqual({ ok: true });
    await expect(retireLessonAction(LECON)).resolves.toEqual({ error: 'introuvable' });

    expect(retireLesson).toHaveBeenCalledWith(ctx, LECON);
  });

  it('ouvre le texte d’une version lisible ; une version illisible ou introuvable ne s’ouvre pas', async () => {
    const version = {
      n: 1,
      texte: 'Version 1.',
      creeLe: new Date(),
      ecritPar: 'serveur' as const,
      motif: 'rangement' as const,
    };
    vi.mocked(readMemoryVersion).mockResolvedValueOnce(version).mockResolvedValueOnce(null);
    vi.mocked(signedInRecently).mockResolvedValue(false);

    await expect(readMemoryVersionAction({ cible: 'fil', id: FIL, n: 1 })).resolves.toEqual({
      ok: true,
      version,
    });
    await expect(readMemoryVersionAction({ cible: 'note', id: FIL, n: 2 })).resolves.toEqual({
      error: 'introuvable',
    });
    expect(readMemoryVersion).toHaveBeenCalledWith(ctx, { cible: 'fil', id: FIL, n: 1 });
    expect(readMemoryVersion).toHaveBeenCalledWith(ctx, { cible: 'note', id: FIL, n: 2 });
  });

  it.each([
    ['écrire, sans objet', () => writeLessonAction(null as never)],
    ['écrire, un texte qui n’est pas une chaîne', () => writeLessonAction({ texte: 1 } as never)],
    [
      'corriger, un numéro décimal',
      () => correctLessonAction({ id: LECON, texte: 'x', depuis: 1.5 }),
    ],
    [
      'remettre, une cible inconnue',
      () => restoreMemoryVersionAction({ cible: 'session', id: FIL, n: 1, depuis: 2 } as never),
    ],
    [
      'remettre, un id qui n’est pas un uuid',
      () => restoreMemoryVersionAction({ cible: 'fil', id: 'leon:fil:<script>', n: 1, depuis: 2 }),
    ],
    [
      'remettre, un numéro hors de l’int4',
      () => restoreMemoryVersionAction({ cible: 'fil', id: FIL, n: 2 ** 31, depuis: 2 }),
    ],
    ['ouvrir, un numéro nul', () => readMemoryVersionAction({ cible: 'lecon', id: LECON, n: 0 })],
    ['retirer, un id qui n’est pas une chaîne', () => retireLessonAction(42 as never)],
  ])('%s : « invalide », sans rien appeler ni recopier', async (_name, call) => {
    const result = await call();

    expect(result).toEqual({ error: 'invalide' });
    for (const writer of [...writers(), vi.mocked(retireLesson), vi.mocked(readMemoryVersion)])
      expect(writer).not.toHaveBeenCalled();
  });

  it('écrire ou corriger un texte refusé par lessons.ts : « invalide », sans recopier le texte', async () => {
    vi.mocked(writeLesson).mockResolvedValue('invalide');
    vi.mocked(correctLesson).mockResolvedValue('invalide');
    const long = 'x'.repeat(301);

    const results = [
      await writeLessonAction({ texte: long, projet: null }),
      await correctLessonAction({ id: LECON, texte: long, depuis: 1 }),
    ];

    expect(results).toEqual([{ error: 'invalide' }, { error: 'invalide' }]);
    expect(JSON.stringify(results)).not.toContain('xxx');
  });

  it('sans session du navigateur, rien n’est appelé : la connexion', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(writeLessonAction({ texte: 'Bien.', projet: null })).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );
    await expect(retireLessonAction(LECON)).rejects.toThrow('NEXT_REDIRECT /connexion');
    await expect(readMemoryVersionAction({ cible: 'fil', id: FIL, n: 1 })).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );

    for (const writer of [...writers(), vi.mocked(retireLesson), vi.mocked(readMemoryVersion)])
      expect(writer).not.toHaveBeenCalled();
  });
});

// T65 (C16) : l'interrupteur des notes de la section Mémoire, sous la session du navigateur, dans les deux sens. Il
// n'écrit aucun texte poussé : pas de connexion récente exigée (D37).
describe('setNotesOpenAction', () => {
  beforeEach(() => {
    vi.mocked(setNotesRefused).mockResolvedValue(true);
    vi.mocked(signedInRecently).mockResolvedValue(false);
  });

  it('coupe puis rouvre les notes sur la ligne du lecteur, même connecté depuis plus d’une heure', async () => {
    await expect(setNotesOpenAction(false)).resolves.toEqual({ ok: true });
    await expect(setNotesOpenAction(true)).resolves.toEqual({ ok: true });

    expect(vi.mocked(setNotesRefused).mock.calls).toEqual([
      [ctx, true],
      [ctx, false],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/reglages');
  });

  it('une ligne absente (plus membre) rend ok: false', async () => {
    vi.mocked(setNotesRefused).mockResolvedValue(false);

    await expect(setNotesOpenAction(false)).resolves.toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([['oui'], [null], [1]])('%j : ok: false, rien ne change', async (value) => {
    await expect(setNotesOpenAction(value as never)).resolves.toEqual({ ok: false });
    expect(setNotesRefused).not.toHaveBeenCalled();
  });

  it('sans session du navigateur, rien ne change : la connexion', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(setNotesOpenAction(false)).rejects.toThrow('NEXT_REDIRECT /connexion');
    expect(setNotesRefused).not.toHaveBeenCalled();
  });
});
