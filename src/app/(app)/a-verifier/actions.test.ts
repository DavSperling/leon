import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { resolveReviewItem } from '@/server/memory/review-items';
import { resolveReviewAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/memory/review-items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/memory/review-items')>()),
  resolveReviewItem: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ITEM_ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const SHARE = { kind: 'sensitive_fact', decision: 'share' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
});

describe('resolveReviewAction', () => {
  it("tranche l'élément pour le lecteur connecté, puis rafraîchit la liste et le compteur", async () => {
    vi.mocked(resolveReviewItem).mockResolvedValue({ ok: true });

    await expect(resolveReviewAction(ITEM_ID, SHARE)).resolves.toEqual({ ok: true });

    expect(resolveReviewItem).toHaveBeenCalledWith(ctx, ITEM_ID, SHARE);
    expect(revalidatePath).toHaveBeenCalledWith('/a-verifier');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it("rend le refus du serveur tel quel et rafraîchit quand même : l'élément a pu être traité entre-temps", async () => {
    vi.mocked(resolveReviewItem).mockResolvedValue({ ok: false, reason: 'deja_traite' });

    await expect(resolveReviewAction(ITEM_ID, SHARE)).resolves.toEqual({
      ok: false,
      reason: 'deja_traite',
    });

    expect(revalidatePath).toHaveBeenCalledWith('/a-verifier');
  });

  it("refuse un identifiant qui n'est pas un UUID, sans rien trancher", async () => {
    await expect(resolveReviewAction('pas-un-uuid', SHARE)).rejects.toThrow();

    expect(resolveReviewItem).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'sensitive_fact', decision: 'delete' },
    { kind: 'inconnu', decision: 'share' },
    { kind: 'conflict', decision: 'share' },
    { kind: 'sensitive_fact', decision: 'share', extra: true },
  ])('refuse la résolution %j, sans rien trancher', async (resolution) => {
    await expect(
      resolveReviewAction(
        ITEM_ID,
        resolution as unknown as Parameters<typeof resolveReviewAction>[1],
      ),
    ).rejects.toThrow();

    expect(resolveReviewItem).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('ne tranche rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(resolveReviewAction(ITEM_ID, SHARE)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(resolveReviewItem).not.toHaveBeenCalled();
  });
});
