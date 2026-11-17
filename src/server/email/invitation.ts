import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/request';
import { env } from '@/server/env';

// Les noms (de l'organisation, de qui invite) sont choisis par chacun : ils entrent dans du HTML.
const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// Le serveur sait-il envoyer un e-mail ? Le même envoi que la réinitialisation du mot de passe (auth.ts) : Resend.
export const mailConfigured = () => Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

// Le lien d'invitation envoyé à la personne invitée, dans la langue de qui invite. Lève si Resend refuse ; ne
// s'appelle qu'après `mailConfigured()`.
export async function sendInvitationEmail(input: {
  to: string;
  url: string;
  locale: Locale;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
}): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) throw new Error('No mail service configured');
  const messages = (await import(`../../../messages/${input.locale}.json`)).default;
  const t = createTranslator({ locale: input.locale, messages, namespace: 'team.mail' });
  const values = {
    inviter: escapeHtml(input.inviterName),
    organization: escapeHtml(input.organizationName),
    date: input.expiresAt.toLocaleDateString(input.locale, { dateStyle: 'long' }),
  };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LEON_EMAIL_FROM,
      to: [input.to],
      // Le sujet n'est pas du HTML : les noms tels quels.
      subject: t('subject', {
        inviter: input.inviterName,
        organization: input.organizationName,
      }),
      html: `<p>${t('intro', values)}</p><p><a href="${escapeHtml(input.url)}">${t('action', values)}</a></p><p>${t('note', values)}</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Invitation email failed (${response.status})`);
}
