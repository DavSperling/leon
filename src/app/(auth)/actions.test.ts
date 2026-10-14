import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithPassword } from '@/server/auth/session';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { signInAction, signUpAction } from './actions';

vi.mock('@/server/auth/sign-up', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/sign-up')>()),
  createUserWithOrganization: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({ signInWithPassword: vi.fn() }));
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
  organizationName: 'Dupont Rénovation',
};

beforeEach(() => vi.clearAllMocks());

describe('signUpAction', () => {
  it('renvoie une erreur par champ invalide, sans créer de compte', async () => {
    const state = await signUpAction(
      {},
      form({ name: '', email: 'pas-un-mail', password: 'court', organizationName: 'D' }),
    );

    expect(Object.keys(state.errors ?? {}).sort()).toEqual([
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

  it('connecte le nouvel utilisateur puis va à l’accueil', async () => {
    vi.mocked(createUserWithOrganization).mockResolvedValue({
      ok: true,
      userId: 'u',
      tenantId: 't',
    });
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true });

    await expect(signUpAction({}, form(validSignUp))).rejects.toThrow('NEXT_REDIRECT /');

    expect(signInWithPassword).toHaveBeenCalledWith('paul@example.com', 'motdepasse-solide');
  });
});

describe('signUpAction, connexion qui échoue après la création', () => {
  it("invite à se connecter à la main au lieu d'aller à l'accueil", async () => {
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
