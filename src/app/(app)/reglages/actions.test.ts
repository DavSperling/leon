import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { requireUserContext } from '@/server/auth/session';
import { createTokenAction, revokeTokenAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/auth/api-tokens', () => ({ createApiToken: vi.fn(), revokeApiToken: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const TOKEN_ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const SECRET = 'leon_jeton-de-test-qui-ne-doit-jamais-etre-journalise';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
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
