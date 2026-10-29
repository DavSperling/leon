import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/request';
import { env } from '@/server/env';

// Le nom de l'organisation est choisi par chacun : il entre dans du HTML.
const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Même envoi que `sendPasswordReset` (auth.ts) : Resend par `fetch`, ici par lot (`/emails/batch`, 100 messages
// au plus) pour qu'une organisation entière ne tienne pas la requête des minutes. Sans Resend, rien ne part (la
// suppression, elle, est déjà faite) ; si Resend refuse, l'appelant le journalise sans que la suppression en pâtisse.
// Aucun lien : un message qu'on n'a pas demandé ne doit rien proposer de cliquer.
export const RESEND_BATCH_MAX = 100;

export async function sendDeletionEmails(input: {
  recipients: { email: string; kind: 'account' | 'organization' }[];
  locale: Locale;
  organizationName: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) return;
  const { recipients, locale, organizationName } = input;
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'deleteAccount' });
  const values = {
    organization: escapeHtml(organizationName),
    date: new Date().toLocaleDateString(locale, { dateStyle: 'long' }),
  };
  // Seul l'e-mail du compte renvoie vers l'administrateur : une organisation supprimée n'en a plus, et son
  // propriétaire l'a voulu.
  const emails = recipients.map(({ email, kind }) => ({
    from: env.LEON_EMAIL_FROM,
    to: [email],
    subject: t(kind === 'account' ? 'emailSubjectAccount' : 'emailSubjectOrganization'),
    html: (kind === 'account'
      ? [t('emailAccount', values), t('emailIgnore')]
      : [t('emailOrganization', values)]
    )
      .map((text) => `<p>${text}</p>`)
      .join(''),
  }));
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
    // Un Resend qui ne répond pas ne doit pas retenir la redirection.
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Deletion email failed (${response.status})`);
}
