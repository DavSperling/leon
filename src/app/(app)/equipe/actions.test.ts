import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelInvitation, invitationToSend } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { requireUserContext } from '@/server/auth/session';
import { mailConfigured, sendInvitationEmail } from '@/server/email/invitation';
import { logError } from '@/server/log';
import { cancelInvitationAction, sendInvitationEmailAction } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(),
  getSession: vi.fn(async () => ({ user: { name: 'Claire' } })),
  requestHeaders: vi.fn(async () => new Headers()),
}));
vi.mock('@/server/auth/members', () => ({ cancelInvitation: vi.fn(), invitationToSend: vi.fn() }));
vi.mock('@/server/auth/organisation', () => ({ setFollowed: vi.fn(), setSeeAll: vi.fn() }));
vi.mock('@/server/auth/rate-limit', () => ({ authAttemptAllowed: vi.fn() }));
vi.mock('@/server/email/invitation', () => ({
  mailConfigured: vi.fn(),
  sendInvitationEmail: vi.fn(),
}));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));

const ctx = { tenantId: 't', userId: 'u', principals: ['u'] };
const TOKEN = 'a'.repeat(43);
const URL = `http://localhost:3000/invitation/${TOKEN}`;
const expiresAt = new Date('2026-11-19T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx as never);
  vi.mocked(mailConfigured).mockReturnValue(true);
  vi.mocked(invitationToSend).mockResolvedValue({ organizationName: 'Lebrun', expiresAt });
  vi.mocked(authAttemptAllowed).mockResolvedValue(true);
  vi.mocked(sendInvitationEmail).mockResolvedValue();
});

describe('sendInvitationEmailAction', () => {
  it('envoie le lien reconstruit par le serveur, au nom de qui invite', async () => {
    expect(await sendInvitationEmailAction(URL, '  ines@example.com ')).toEqual({ ok: true });
    expect(invitationToSend).toHaveBeenCalledWith(ctx, TOKEN);
    expect(authAttemptAllowed).toHaveBeenCalledWith(
      'invitation',
      'ines@example.com',
      expect.any(Headers),
    );
    expect(sendInvitationEmail).toHaveBeenCalledWith({
      to: 'ines@example.com',
      url: URL,
      locale: 'fr',
      organizationName: 'Lebrun',
      inviterName: 'Claire',
      expiresAt,
    });
  });

  it.each(['', 'ines', 'ines@', '@example.com', 'a b@example.com', null])(
    'refuse une adresse mal formée (%o) sans rien envoyer',
    async (email) => {
      expect(await sendInvitationEmailAction(URL, email as never)).toEqual({ error: 'address' });
      expect(sendInvitationEmail).not.toHaveBeenCalled();
    },
  );

  it("dit qu'aucun service d'e-mail n'est configuré", async () => {
    vi.mocked(mailConfigured).mockReturnValue(false);
    expect(await sendInvitationEmailAction(URL, 'ines@example.com')).toEqual({
      error: 'unconfigured',
    });
    expect(invitationToSend).not.toHaveBeenCalled();
  });

  it.each(['https://phishing.example/x', `${URL}/../autre`, 'pas une adresse'])(
    "refuse un lien qui n'est pas un lien d'invitation (%s)",
    async (url) => {
      expect(await sendInvitationEmailAction(url, 'ines@example.com')).toEqual({
        error: 'refused',
      });
      expect(sendInvitationEmail).not.toHaveBeenCalled();
    },
  );

  it("refuse un lien d'ailleurs, servi, expiré, ou quand le lecteur ne peut plus inviter", async () => {
    vi.mocked(invitationToSend).mockResolvedValue(null);
    expect(await sendInvitationEmailAction(URL, 'ines@example.com')).toEqual({
      error: 'refused',
    });
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('respecte la limite par adresse', async () => {
    vi.mocked(authAttemptAllowed).mockResolvedValue(false);
    expect(await sendInvitationEmailAction(URL, 'ines@example.com')).toEqual({ error: 'limit' });
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('dit que l’envoi a échoué, et le journalise', async () => {
    vi.mocked(sendInvitationEmail).mockRejectedValue(new Error('Invitation email failed (500)'));
    expect(await sendInvitationEmailAction(URL, 'ines@example.com')).toEqual({ error: 'failed' });
    expect(logError).toHaveBeenCalled();
  });
});

describe('cancelInvitationAction', () => {
  it("annule et redessine l'écran", async () => {
    vi.mocked(cancelInvitation).mockResolvedValue(true);
    expect(await cancelInvitationAction('id')).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('ne redessine rien sur un refus', async () => {
    vi.mocked(cancelInvitation).mockResolvedValue(false);
    expect(await cancelInvitationAction('id')).toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
