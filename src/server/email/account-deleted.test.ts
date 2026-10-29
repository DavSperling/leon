import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { sendDeletionEmails } from './account-deleted';

const mocks = vi.hoisted(() => ({
  env: {
    RESEND_API_KEY: 're_test' as string | undefined,
    LEON_EMAIL_FROM: 'Leon <test@example.com>' as string | undefined,
  },
}));
vi.mock('@/server/env', () => ({ env: mocks.env }));

const input = { organizationName: 'Dupont Rénovation' };
const to = (kind: 'account' | 'organization') => ({
  recipients: [{ email: 'paul@example.com', kind }],
});

let sent: MockInstance<typeof fetch>;
const batch = () =>
  JSON.parse(String(sent.mock.calls[0]?.[1]?.body)) as Record<string, string | string[]>[];
const payload = () => batch()[0] as Record<string, string>;

beforeEach(() => {
  mocks.env.RESEND_API_KEY = 're_test';
  mocks.env.LEON_EMAIL_FROM = 'Leon <test@example.com>';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  sent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sendDeletionEmails', () => {
  it.each([
    ['la clé Resend', 'RESEND_API_KEY'],
    ['l’expéditeur', 'LEON_EMAIL_FROM'],
  ] as const)('n’envoie rien sans %s', async (_label, variable) => {
    mocks.env[variable] = undefined;

    await expect(
      sendDeletionEmails({ ...input, ...to('account'), locale: 'fr' }),
    ).resolves.toBeUndefined();

    expect(sent).not.toHaveBeenCalled();
  });

  it.each([
    ['fr', fr, '28 octobre 2026'],
    ['en', en, 'October 28, 2026'],
  ] as const)('écrit le sujet et le texte en %s', async (locale, messages, date) => {
    await sendDeletionEmails({ ...input, ...to('account'), locale });
    expect(payload()).toMatchObject({
      from: 'Leon <test@example.com>',
      to: ['paul@example.com'],
      subject: messages.deleteAccount.emailSubjectAccount,
    });
    expect(payload().html).toContain('Dupont Rénovation');
    expect(payload().html).toContain(date);
    expect(payload().html).toContain(messages.deleteAccount.emailIgnore);

    sent.mockClear();
    await sendDeletionEmails({ ...input, ...to('organization'), locale });
    expect(payload().subject).toBe(messages.deleteAccount.emailSubjectOrganization);
    expect(payload().html).toContain('Dupont Rénovation');
    expect(payload().html).not.toContain(messages.deleteAccount.emailIgnore);
  });

  it('s’identifie auprès de Resend, sans mettre de lien dans le message', async () => {
    await sendDeletionEmails({ ...input, ...to('organization'), locale: 'fr' });

    expect(sent.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer re_test' });
    expect(payload().html).not.toContain('href');
  });

  it('abandonne un envoi que Resend laisse sans réponse', async () => {
    await sendDeletionEmails({ ...input, ...to('account'), locale: 'fr' });

    expect(sent.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('protège le message du nom de l’organisation, que chacun choisit', async () => {
    await sendDeletionEmails({
      ...to('account'),
      organizationName: 'Dupont <b>& fils</b>',
      locale: 'fr',
    });

    expect(payload().html).toContain('Dupont &lt;b&gt;&amp; fils&lt;/b&gt;');
    expect(payload().html).not.toContain('<b>');
  });

  it('envoie tout le lot en une requête, chaque message selon son destinataire', async () => {
    await sendDeletionEmails({
      ...input,
      locale: 'fr',
      recipients: [
        { email: 'amos@example.com', kind: 'account' },
        { email: 'paul@example.com', kind: 'organization' },
      ],
    });

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails/batch');
    expect(batch()).toMatchObject([
      { to: ['amos@example.com'], subject: fr.deleteAccount.emailSubjectAccount },
      { to: ['paul@example.com'], subject: fr.deleteAccount.emailSubjectOrganization },
    ]);
  });

  it('lève quand Resend refuse', async () => {
    sent.mockResolvedValue(new Response('{}', { status: 422 }));

    await expect(sendDeletionEmails({ ...input, ...to('account'), locale: 'fr' })).rejects.toThrow(
      '422',
    );
  });
});
