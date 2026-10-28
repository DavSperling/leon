import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { sendDeletionEmail } from './account-deleted';

const mocks = vi.hoisted(() => ({
  env: {
    RESEND_API_KEY: 're_test' as string | undefined,
    LEON_EMAIL_FROM: 'Leon <test@example.com>' as string | undefined,
  },
}));
vi.mock('@/server/env', () => ({ env: mocks.env }));

const input = {
  to: 'paul@example.com',
  organizationName: 'Dupont Rénovation',
} as const;

let sent: MockInstance<typeof fetch>;
const payload = () => JSON.parse(String(sent.mock.calls[0]?.[1]?.body)) as Record<string, string>;

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

describe('sendDeletionEmail', () => {
  it.each([
    ['la clé Resend', 'RESEND_API_KEY'],
    ['l’expéditeur', 'LEON_EMAIL_FROM'],
  ] as const)('n’envoie rien sans %s', async (_label, variable) => {
    mocks.env[variable] = undefined;

    await expect(
      sendDeletionEmail({ ...input, locale: 'fr', kind: 'account' }),
    ).resolves.toBeUndefined();

    expect(sent).not.toHaveBeenCalled();
  });

  it.each([
    ['fr', fr, '28 octobre 2026'],
    ['en', en, 'October 28, 2026'],
  ] as const)('écrit le sujet et le texte en %s', async (locale, messages, date) => {
    await sendDeletionEmail({ ...input, locale, kind: 'account' });
    expect(payload()).toMatchObject({
      from: 'Leon <test@example.com>',
      to: ['paul@example.com'],
      subject: messages.deleteAccount.emailSubjectAccount,
    });
    expect(payload().html).toContain('Dupont Rénovation');
    expect(payload().html).toContain(date);
    expect(payload().html).toContain(messages.deleteAccount.emailIgnore);

    sent.mockClear();
    await sendDeletionEmail({ ...input, locale, kind: 'organization' });
    expect(payload().subject).toBe(messages.deleteAccount.emailSubjectOrganization);
    expect(payload().html).toContain('Dupont Rénovation');
  });

  it('s’identifie auprès de Resend, sans mettre de lien dans le message', async () => {
    await sendDeletionEmail({ ...input, locale: 'fr', kind: 'organization' });

    expect(sent.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer re_test' });
    expect(payload().html).not.toContain('href');
  });

  it('protège le message du nom de l’organisation, que chacun choisit', async () => {
    await sendDeletionEmail({
      ...input,
      organizationName: 'Dupont <b>& fils</b>',
      locale: 'fr',
      kind: 'account',
    });

    expect(payload().html).toContain('Dupont &lt;b&gt;&amp; fils&lt;/b&gt;');
    expect(payload().html).not.toContain('<b>');
  });

  it('lève quand Resend refuse', async () => {
    sent.mockResolvedValue(new Response('{}', { status: 422 }));

    await expect(sendDeletionEmail({ ...input, locale: 'fr', kind: 'account' })).rejects.toThrow(
      '422',
    );
  });
});
