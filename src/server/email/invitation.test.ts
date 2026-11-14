import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { mailConfigured, sendInvitationEmail } from './invitation';

const mocks = vi.hoisted(() => ({
  env: {
    RESEND_API_KEY: 're_test' as string | undefined,
    LEON_EMAIL_FROM: 'Leon <test@example.com>' as string | undefined,
  },
}));
vi.mock('@/server/env', () => ({ env: mocks.env }));

const URL = `https://leon.example/invitation/${'t'.repeat(43)}`;
const input = {
  to: 'ines@example.com',
  url: URL,
  organizationName: 'Dupont & <Fils>',
  inviterName: 'Claire',
  expiresAt: new Date('2026-11-19T12:00:00Z'),
};

let sent: MockInstance<typeof fetch>;
const payload = () => JSON.parse(String(sent.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  mocks.env.RESEND_API_KEY = 're_test';
  mocks.env.LEON_EMAIL_FROM = 'Leon <test@example.com>';
  sent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("l'e-mail d'invitation", () => {
  it.each(['RESEND_API_KEY', 'LEON_EMAIL_FROM'] as const)(
    "ne se dit pas configuré sans %s, et n'envoie rien",
    async (variable) => {
      mocks.env[variable] = undefined;
      expect(mailConfigured()).toBe(false);
      await expect(sendInvitationEmail({ ...input, locale: 'fr' })).rejects.toThrow();
      expect(sent).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['fr', fr, '19 novembre 2026'],
    ['en', en, 'November 19, 2026'],
  ] as const)('envoie le lien, en %s, avec les noms échappés', async (locale, messages, date) => {
    expect(mailConfigured()).toBe(true);
    await sendInvitationEmail({ ...input, locale });

    expect(sent.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    const body = payload();
    expect(body).toMatchObject({ from: 'Leon <test@example.com>', to: ['ines@example.com'] });
    // le sujet n'est pas du HTML : les noms tels quels
    expect(body.subject).toBe(
      messages.team.mail.subject
        .replace('{inviter}', 'Claire')
        .replace('{organization}', 'Dupont & <Fils>'),
    );
    const html = String(body.html);
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('Dupont &amp; &lt;Fils&gt;');
    expect(html).not.toContain('<Fils>');
    expect(html).toContain(date);
  });

  it('lève quand Resend refuse', async () => {
    sent.mockResolvedValue(new Response('{}', { status: 422 }));
    await expect(sendInvitationEmail({ ...input, locale: 'en' })).rejects.toThrow('422');
  });
});
