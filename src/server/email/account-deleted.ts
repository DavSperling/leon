import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/request';
import { env } from '@/server/env';

// Le nom de l'organisation est choisi par chacun : il entre dans du HTML.
const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Même envoi que `sendPasswordReset` (auth.ts) : Resend par `fetch`. Sans Resend, rien ne part (la suppression, elle,
// est déjà faite) ; si Resend refuse, l'appelant le journalise sans que la suppression en pâtisse. Aucun lien : un
// message qu'on n'a pas demandé ne doit rien proposer de cliquer.
export async function sendDeletionEmail(input: {
  to: string;
  locale: Locale;
  kind: 'account' | 'organization';
  organizationName: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) return;
  const { to, locale, kind, organizationName } = input;
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'deleteAccount' });
  const values = {
    organization: escapeHtml(organizationName),
    date: new Date().toLocaleDateString(locale, { dateStyle: 'long' }),
  };
  // Seul l'e-mail du compte renvoie vers l'administrateur : une organisation supprimée n'en a plus, et son
  // propriétaire l'a voulu.
  const paragraphs =
    kind === 'account'
      ? [t('emailAccount', values), t('emailIgnore')]
      : [t('emailOrganization', values)];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LEON_EMAIL_FROM,
      to: [to],
      subject: t(kind === 'account' ? 'emailSubjectAccount' : 'emailSubjectOrganization'),
      html: paragraphs.map((text) => `<p>${text}</p>`).join(''),
    }),
    // Les envois partent l'un après l'autre : un Resend qui ne répond pas ne doit pas retenir toute la suite.
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Deletion email failed (${response.status})`);
}
