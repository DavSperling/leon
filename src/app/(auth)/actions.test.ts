import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/server/auth/auth';
import { authorizePath } from '@/server/auth/computer-authorize';
import { joinWithInvitation } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { getSession, getUserContext, signInWithPassword } from '@/server/auth/session';
import { createUserWithInvitation, createUserWithOrganization } from '@/server/auth/sign-up';
import {
  joinAction,
  joinWithSessionAction,
  oneTapAction,
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  socialSignInAction,
  ssoSignInAction,
  verifyTwoFactorAction,
} from './actions';

const resend = vi.hoisted(() => ({ configured: true }));
vi.mock('@/server/auth/auth', () => ({
  auth: {
    api: {
      verifyTOTP: vi.fn(),
      verifyBackupCode: vi.fn(),
      requestPasswordReset: vi.fn(),
      signInSocial: vi.fn(),
      signInSSO: vi.fn(),
      oneTapCallback: vi.fn(),
    },
  },
  socialProviders: { google: {} },
  get emailEnabled() {
    return resend.configured;
  },
}));
vi.mock('@/server/auth/sign-up', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/sign-up')>()),
  createUserWithOrganization: vi.fn(),
  createUserWithInvitation: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({
  signInWithPassword: vi.fn(),
  getSession: vi.fn(),
  getUserContext: vi.fn(),
  ONBOARDING_PATH: '/bienvenue',
}));
vi.mock('@/server/auth/members', () => ({ joinWithInvitation: vi.fn() }));
vi.mock('@/server/auth/rate-limit', () => ({ authAttemptAllowed: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const validSignUp = {
  name: 'Paul Martin',
  email: 'paul@example.com',
  password: 'motdepasse-solide',
  confirmation: 'motdepasse-solide',
  organizationName: 'Dupont Rénovation',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authAttemptAllowed).mockResolvedValue(true);
  resend.configured = true;
});

// Audit 2 n° 3 : la connexion et l'inscription passent par une limite de débit (rate-limit.ts).
const TOO_MANY_ATTEMPTS = 'Trop de tentatives. Réessayez dans quelques minutes.';

describe('limite de débit', () => {
  it('refuse la connexion au-delà de la limite, sans essayer le mot de passe', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);

    const state = await signInAction({}, form({ email: 'paul@example.com', password: 'x' }));

    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'connexion',
      'paul@example.com',
      expect.any(Headers),
    );
    expect(state.errors).toEqual({ form: TOO_MANY_ATTEMPTS });
    expect(state.values).toEqual({ email: 'paul@example.com' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('refuse l’inscription au-delà de la limite, sans créer de compte', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);

    const state = await signUpAction({}, form(validSignUp));

    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'inscription',
      'paul@example.com',
      expect.any(Headers),
    );
    expect(state.errors).toEqual({ form: TOO_MANY_ATTEMPTS });
    expect(createUserWithOrganization).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('signUpAction', () => {
  it('renvoie une erreur par champ invalide, sans créer de compte', async () => {
    const state = await signUpAction(
      {},
      form({ name: '', email: 'pas-un-mail', password: 'court', organizationName: 'D' }),
    );

    expect(Object.keys(state.errors ?? {}).sort()).toEqual([
      'confirmation',
      'email',
      'name',
      'organizationName',
      'password',
    ]);
    expect(createUserWithOrganization).not.toHaveBeenCalled();
  });

  it('garde ce qui a été saisi, sauf le mot de passe', async () => {
    const state = await signUpAction({}, form({ ...validSignUp, email: 'pas-un-mail' }));

    expect(state.values).toEqual({
      name: 'Paul Martin',
      email: 'pas-un-mail',
      organizationName: 'Dupont Rénovation',
    });
  });

  it("place l'erreur d'un e-mail déjà pris sur le champ e-mail", async () => {
    vi.mocked(createUserWithOrganization).mockResolvedValue({ ok: false, error: 'email_pris' });

    const state = await signUpAction({}, form(validSignUp));

    expect(Object.keys(state.errors ?? {})).toEqual(['email']);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('affiche un message général quand la création échoue pour une autre raison', async () => {
    vi.mocked(createUserWithOrganization).mockResolvedValue({ ok: false, error: 'invalide' });

    const state = await signUpAction({}, form(validSignUp));

    expect(state.errors).toEqual({ form: 'Impossible de créer le compte. Réessayez.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('envoie un lien de vérification sans ouvrir la session (vérification d’e-mail active)', async () => {
    vi.mocked(createUserWithOrganization).mockResolvedValue({
      ok: true,
      userId: 'u',
      tenantId: 't',
    });

    const state = await signUpAction({}, form(validSignUp));

    expect(state.message).toBeDefined();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('connecte le nouvel utilisateur puis va à l’accueil quand l’envoi d’e-mails n’est pas configuré', async () => {
    resend.configured = false;
    vi.mocked(createUserWithOrganization).mockResolvedValue({
      ok: true,
      userId: 'u',
      tenantId: 't',
    });
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signUpAction({}, form(validSignUp))).rejects.toThrow('NEXT_REDIRECT /');

    expect(signInWithPassword).toHaveBeenCalledWith('paul@example.com', 'motdepasse-solide');
  });

  it('refuse deux mots de passe différents, sans créer de compte', async () => {
    const state = await signUpAction({}, form({ ...validSignUp, confirmation: 'autre-chose' }));

    expect(state.errors).toEqual({ confirmation: 'Les mots de passe ne correspondent pas.' });
    expect(createUserWithOrganization).not.toHaveBeenCalled();
  });
});

describe('signUpAction, connexion qui échoue après la création (sans envoi d’e-mails)', () => {
  it("invite à se connecter à la main au lieu d'aller à l'accueil", async () => {
    resend.configured = false;
    vi.mocked(createUserWithOrganization).mockResolvedValue({
      ok: true,
      userId: 'u',
      tenantId: 't',
    });
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false });

    const state = await signUpAction({}, form(validSignUp));

    expect(state.errors?.form).toContain('Connectez-vous');
  });
});

describe('signInAction', () => {
  it('refuse sans dire si c’est l’e-mail ou le mot de passe qui est faux', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false });

    const state = await signInAction({}, form({ email: 'paul@example.com', password: 'faux' }));

    expect(state.errors).toEqual({ form: 'E-mail ou mot de passe incorrect.' });
  });

  it('invite à vérifier la boîte mail quand l’adresse n’est pas vérifiée', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false, unverified: true });

    const state = await signInAction(
      {},
      form({ email: 'paul@example.com', password: 'bon-mot-de-passe' }),
    );

    expect(state.errors?.form).toContain('vérifiez votre boîte mail');
  });

  it('ne tente pas la connexion avec un e-mail mal formé', async () => {
    const state = await signInAction({}, form({ email: 'pas-un-mail', password: 'x' }));

    expect(state.errors?.email).toBeDefined();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('va à l’accueil quand la connexion réussit', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(
      signInAction({}, form({ email: 'paul@example.com', password: 'motdepasse-solide' })),
    ).rejects.toThrow('NEXT_REDIRECT /');
  });
});

// `leon login` : la page /ordinateur/autoriser envoie vers /connexion, et la connexion revient à l'autorisation en
// cours. Le champ `retour` revient d'un navigateur : seul un chemin d'autorisation aux paramètres valides compte.
describe('retour à l’autorisation d’un ordinateur', () => {
  const AUTHORIZE = authorizePath({
    port: 4242,
    etat: 'AbCdEfGhIjKlMnOpQrStUv',
    empreinte: 'a1'.repeat(32),
  });
  // toThrow(Error) compare le message en entier : "NEXT_REDIRECT /" ne vaut pas "NEXT_REDIRECT /reglages".
  const redirectsTo = (path: string) => new Error(`NEXT_REDIRECT ${path}`);
  const signedIn = { email: 'paul@example.com', password: 'motdepasse-solide' };

  it('la connexion revient à la page d’autorisation', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signInAction({}, form({ ...signedIn, retour: AUTHORIZE }))).rejects.toThrow(
      redirectsTo(AUTHORIZE),
    );
  });

  it('la vérification du code (2FA) aussi, avec un code ou un code de secours', async () => {
    for (const code of ['123456', 'V5qHD-kSFGw']) {
      await expect(verifyTwoFactorAction({}, form({ code, retour: AUTHORIZE }))).rejects.toThrow(
        redirectsTo(AUTHORIZE),
      );
    }
  });

  it.each([
    ['une adresse absolue', `https://evil.example${AUTHORIZE}`],
    ['une adresse sans schéma', `//evil.example${AUTHORIZE}`],
    ['une autre page', '/reglages'],
    ['une autorisation au port invalide', AUTHORIZE.replace('port=4242', 'port=80')],
  ])('%s : retour à l’accueil', async (_name, retour) => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signInAction({}, form({ ...signedIn, retour }))).rejects.toThrow(redirectsTo('/'));
    await expect(verifyTwoFactorAction({}, form({ code: '123456', retour }))).rejects.toThrow(
      redirectsTo('/'),
    );
  });

  it('une connexion refusée ne renvoie nulle part', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false });

    const state = await signInAction({}, form({ ...signedIn, retour: AUTHORIZE }));

    expect(state.errors).toEqual({ form: 'E-mail ou mot de passe incorrect.' });
  });
});

// Un assistant (claude.ai, ChatGPT, Claude Code…) : /oauth/autoriser envoie vers /connexion, qui revient à la demande en
// cours. Le champ `retour` revient d'un navigateur : seul le chemin fixe, aux huit paramètres connus et bornés, compte.
// Le client et l'adresse de retour, eux, sont jugés par la page à chaque affichage (oauth/autoriser/page.test.ts).
describe('retour à l’autorisation d’un assistant', () => {
  const OAUTH = `/oauth/autoriser?${new URLSearchParams({
    response_type: 'code',
    client_id: 'un-client-id',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    state: 'etat du client',
    code_challenge: 'A'.repeat(43),
    code_challenge_method: 'S256',
    scope: 'leon',
    resource: 'http://localhost:3000/api/mcp',
  })}`;
  const redirectsTo = (path: string) => new Error(`NEXT_REDIRECT ${path}`);
  const signedIn = { email: 'paul@example.com', password: 'motdepasse-solide' };

  it('la connexion revient à la même demande', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signInAction({}, form({ ...signedIn, retour: OAUTH }))).rejects.toThrow(
      redirectsTo(OAUTH),
    );
  });

  it('la vérification du code (2FA) aussi, avec un code ou un code de secours', async () => {
    for (const code of ['123456', 'V5qHD-kSFGw']) {
      await expect(verifyTwoFactorAction({}, form({ code, retour: OAUTH }))).rejects.toThrow(
        redirectsTo(OAUTH),
      );
    }
  });

  it('rebâtit le chemin : un paramètre en trop ne le suit pas', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(
      signInAction({}, form({ ...signedIn, retour: `${OAUTH}&suite=https://evil.example` })),
    ).rejects.toThrow(redirectsTo(OAUTH));
  });

  it.each([
    ['une adresse absolue', `https://evil.example${OAUTH}`],
    ['une adresse sans schéma', `//evil.example${OAUTH}`],
    ['une autre page', OAUTH.replace('/oauth/autoriser', '/reglages')],
    ['un autre chemin de la page', OAUTH.replace('/oauth/autoriser', '/oauth/autoriser/../x')],
    ['une demande sans client_id', OAUTH.replace('client_id=un-client-id&', '')],
    ['un client_id de plus de 4 Ko', OAUTH.replace('un-client-id', 'a'.repeat(4097))],
  ])('%s : retour à l’accueil', async (_name, retour) => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signInAction({}, form({ ...signedIn, retour }))).rejects.toThrow(redirectsTo('/'));
    await expect(verifyTwoFactorAction({}, form({ code: '123456', retour }))).rejects.toThrow(
      redirectsTo('/'),
    );
  });

  it('une adresse non vérifiée affiche le message de la #119 et ne renvoie nulle part', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false, unverified: true });

    const state = await signInAction({}, form({ ...signedIn, retour: OAUTH }));

    expect(state.errors?.form).toContain('vérifiez votre boîte mail');
  });

  it('un mauvais mot de passe ou un code faux ne renvoient nulle part', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false });
    vi.mocked(auth.api.verifyTOTP).mockRejectedValueOnce(new Error('faux'));

    const signIn = await signInAction({}, form({ ...signedIn, retour: OAUTH }));
    const twoFactor = await verifyTwoFactorAction({}, form({ code: '123456', retour: OAUTH }));

    expect(signIn.errors).toEqual({ form: 'E-mail ou mot de passe incorrect.' });
    expect(twoFactor.errors?.form).toBeDefined();
  });
});

describe('joinAction', () => {
  const validJoin = {
    name: 'Julie Petit',
    email: 'julie@example.com',
    password: 'motdepasse-solide',
    confirmation: 'motdepasse-solide',
    token: 'secret-du-lien',
  };

  it('ne renvoie ni le mot de passe ni le secret du lien', async () => {
    vi.mocked(createUserWithInvitation).mockResolvedValue({ ok: false, error: 'email_pris' });

    const state = await joinAction({}, form(validJoin));

    expect(state.values).toEqual({ name: 'Julie Petit', email: 'julie@example.com' });
    expect(state.errors).toEqual({ email: 'Cette adresse e-mail est déjà utilisée.' });
  });

  it('dit que le lien ne vaut plus quand il a servi ou expiré', async () => {
    vi.mocked(createUserWithInvitation).mockResolvedValue({ ok: false, error: 'lien_invalide' });

    const state = await joinAction({}, form(validJoin));

    expect(state.errors?.form).toContain('n’est plus valable');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('envoie un lien de vérification au lieu de connecter (vérification d’e-mail active)', async () => {
    vi.mocked(createUserWithInvitation).mockResolvedValue({ ok: true, userId: 'u', tenantId: 't' });

    const state = await joinAction({}, form(validJoin));

    expect(state.message).toBeDefined();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('compte la tentative comme une inscription, puis connecte et va à l’accueil (sans envoi d’e-mails)', async () => {
    resend.configured = false;
    vi.mocked(createUserWithInvitation).mockResolvedValue({ ok: true, userId: 'u', tenantId: 't' });
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(joinAction({}, form(validJoin))).rejects.toThrow('NEXT_REDIRECT /');

    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'inscription',
      'julie@example.com',
      expect.any(Headers),
    );
    const { confirmation: _, ...input } = validJoin;
    expect(createUserWithInvitation).toHaveBeenCalledWith(input);
    expect(signInWithPassword).toHaveBeenCalledWith('julie@example.com', 'motdepasse-solide');
  });
});

describe('verifyTwoFactorAction', () => {
  it('vérifie un code à 6 chiffres auprès de l’application', async () => {
    await expect(verifyTwoFactorAction({}, form({ code: '123 456' }))).rejects.toThrow(
      'NEXT_REDIRECT /',
    );

    expect(auth.api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: '123456' } }),
    );
    expect(auth.api.verifyBackupCode).not.toHaveBeenCalled();
  });

  it('accepte un code de secours, avec ou sans tiret (téléphone perdu)', async () => {
    for (const code of ['V5qHD-kSFGw', 'V5qHDkSFGw']) {
      await expect(verifyTwoFactorAction({}, form({ code }))).rejects.toThrow('NEXT_REDIRECT /');
    }

    expect(vi.mocked(auth.api.verifyBackupCode).mock.calls.map(([call]) => call?.body)).toEqual([
      { code: 'V5qHD-kSFGw' },
      { code: 'V5qHD-kSFGw' },
    ]);
    expect(auth.api.verifyTOTP).not.toHaveBeenCalled();
  });

  it('reste à l’étape du code quand il est refusé ou mal formé', async () => {
    vi.mocked(auth.api.verifyTOTP).mockRejectedValue(new Error('INVALID_CODE'));

    expect(await verifyTwoFactorAction({}, form({ code: '000000' }))).toEqual({
      twoFactor: true,
      errors: { form: 'Code incorrect ou expiré. Réessayez.' },
    });
    expect((await verifyTwoFactorAction({}, form({ code: '12' }))).errors?.code).toBeDefined();
  });
});

describe('requestPasswordResetAction', () => {
  const SENT =
    'Si cette adresse correspond à un compte, un lien de réinitialisation vient d’être envoyé.';

  it('répond pareil, que le compte existe ou non', async () => {
    vi.mocked(auth.api.requestPasswordReset).mockRejectedValueOnce(new Error('inconnu'));

    const unknown = await requestPasswordResetAction({}, form({ email: 'inconnu@example.com' }));
    const known = await requestPasswordResetAction({}, form({ email: 'paul@example.com' }));

    expect(unknown).toEqual({ message: SENT });
    expect(known).toEqual({ message: SENT });
    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'recuperation',
      'paul@example.com',
      expect.any(Headers),
    );
  });

  it('n’envoie rien au-delà de la limite de débit', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);

    const state = await requestPasswordResetAction({}, form({ email: 'paul@example.com' }));

    expect(state.errors).toEqual({ form: TOO_MANY_ATTEMPTS });
    expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('dit que l’envoi n’est pas configuré au lieu de prétendre avoir envoyé un lien', async () => {
    resend.configured = false;

    const state = await requestPasswordResetAction({}, form({ email: 'paul@example.com' }));

    expect(state.message).toBeUndefined();
    expect(state.errors?.form).toContain('pas configuré');
    expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
  });
});

const TOKEN = 'A'.repeat(43);

describe('Google, Microsoft et SSO', () => {
  it('One Tap : la session ouverte, l’accueil (qui mène un nouveau compte à l’onboarding)', async () => {
    vi.mocked(auth.api.oneTapCallback).mockResolvedValue({} as never);
    await expect(oneTapAction('jeton-google')).rejects.toThrow('NEXT_REDIRECT /');
    expect(vi.mocked(auth.api.oneTapCallback).mock.calls[0]?.[0]?.body).toEqual({
      idToken: 'jeton-google',
    });
  });

  it('One Tap : un jeton refusé ou un compte non lié renvoie à la connexion avec son message', async () => {
    vi.mocked(auth.api.oneTapCallback).mockRejectedValueOnce(new Error('invalid id token'));
    await expect(oneTapAction('x')).rejects.toThrow('NEXT_REDIRECT /connexion?error=one_tap');
    vi.mocked(auth.api.oneTapCallback).mockRejectedValueOnce(new Error('account not linked'));
    await expect(oneTapAction('x')).rejects.toThrow(
      'NEXT_REDIRECT /connexion?error=account_not_linked',
    );
  });

  it('refuse un fournisseur non réglé, sans appeler Better Auth', async () => {
    await expect(socialSignInAction(form({ provider: 'microsoft' }))).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );
    await expect(socialSignInAction(form({ provider: 'constructor' }))).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );
    expect(auth.api.signInSocial).not.toHaveBeenCalled();
  });

  it('part chez Google, et revient sur le lien d’invitation qui l’a lancé', async () => {
    vi.mocked(auth.api.signInSocial).mockResolvedValue({
      url: 'https://accounts.google.com/x',
    } as never);
    await expect(socialSignInAction(form({ provider: 'google', token: TOKEN }))).rejects.toThrow(
      'NEXT_REDIRECT https://accounts.google.com/x',
    );
    expect(vi.mocked(auth.api.signInSocial).mock.calls[0]?.[0]?.body).toEqual({
      provider: 'google',
      callbackURL: `/invitation/${TOKEN}`,
      newUserCallbackURL: `/invitation/${TOKEN}`,
      errorCallbackURL: '/connexion',
    });
  });

  it('un retour forgé ne sort pas de Leon ; un compte neuf passe par l’onboarding', async () => {
    vi.mocked(auth.api.signInSocial).mockResolvedValue({
      url: 'https://accounts.google.com/x',
    } as never);
    await expect(
      socialSignInAction(
        form({ provider: 'google', retour: 'https://evil.example', token: 'court' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(vi.mocked(auth.api.signInSocial).mock.calls[0]?.[0]?.body).toMatchObject({
      callbackURL: '/',
      newUserCallbackURL: '/bienvenue',
    });
  });

  it('SSO : une adresse sans SSO reçoit le même message, sans rien dire de l’espace', async () => {
    vi.mocked(auth.api.signInSSO).mockRejectedValue(new Error('No provider found'));
    const state = await ssoSignInAction({}, form({ email: 'jeanne@acme.com' }));
    expect(state.errors?.email).toMatch(/Aucun SSO/);
  });

  it('SSO : passe par la limite de débit', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);
    const state = await ssoSignInAction({}, form({ email: 'jeanne@acme.com' }));
    expect(state.errors?.form).toBe(TOO_MANY_ATTEMPTS);
    expect(auth.api.signInSSO).not.toHaveBeenCalled();
  });

  it('rejoindre par le lien après Google : seulement sans espace', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(getUserContext).mockResolvedValue({ tenantId: 't0' } as never);
    await expect(joinWithSessionAction(form({ token: TOKEN }))).rejects.toThrow('NEXT_REDIRECT /');
    expect(joinWithInvitation).not.toHaveBeenCalled();

    vi.mocked(getUserContext).mockResolvedValue(null);
    vi.mocked(joinWithInvitation).mockResolvedValue('t1');
    await expect(joinWithSessionAction(form({ token: TOKEN }))).rejects.toThrow(
      'NEXT_REDIRECT /bienvenue',
    );
    expect(joinWithInvitation).toHaveBeenCalledWith(TOKEN, 'u1');
  });
});
