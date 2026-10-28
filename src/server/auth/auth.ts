import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins/organization';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { createTranslator } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { DEFAULT_LOCALE, type Locale, localeOf } from '@/i18n/request';
import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { firstOrganizationId } from './tenant-context';

// Sans Resend, aucun lien ne part : l'écran de connexion ne propose pas « Mot de passe oublié ? ».
export const passwordResetEnabled = Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

// La langue de la personne qui demande le lien, lue dans sa requête (cookie `leon-locale`) ; l'anglais hors requête.
async function requesterLocale(): Promise<Locale> {
  try {
    return localeOf(await getLocale());
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function sendPasswordReset(email: string, url: string, locale: Locale): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and LEON_EMAIL_FROM are required to send password reset email');
  }
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'auth' });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LEON_EMAIL_FROM,
      to: [email],
      subject: t('resetEmailSubject'),
      html: `<p>${t('resetEmailIntro')}</p><p><a href="${url}">${t('resetEmailAction')}</a></p><p>${t('resetEmailIgnore')}</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Password reset email failed (${response.status})`);
}

export const auth = betterAuth({
  appName: 'Leon',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    // Envoi sans attente : la réponse met le même temps que le compte existe ou non (Leon tourne en continu,
    // l'envoi finit après la réponse).
    sendResetPassword: async ({ user, url }) => {
      // La langue se lit dans l'envoi détaché aussi : l'attendre ici ne retarderait que les comptes qui existent.
      void requesterLocale()
        .then((locale) => sendPasswordReset(user.email, url, locale))
        .catch((error) => logError('auth.password_reset_email', error));
    },
  },
  // La connexion, l'inscription, la demande de lien, le changement de mot de passe et la 2FA passent par les server
  // actions (auth.api.*), sous la limite de débit de rate-limit.ts : les routes HTTP de Better Auth la
  // contourneraient (deviner un mot de passe ou un code depuis une session volée ; l'inscription y créerait un compte
  // sans organisation). Seul le routeur les ferme : auth.api.* les appelle toujours. /reset-password/:token reste
  // ouverte : c'est le lien de l'e-mail.
  disabledPaths: [
    '/sign-in/email',
    '/sign-up/email',
    '/request-password-reset',
    '/change-password',
    '/two-factor/enable',
    '/two-factor/disable',
    '/two-factor/get-totp-uri',
    '/two-factor/generate-backup-codes',
    '/two-factor/verify-totp',
    '/two-factor/verify-backup-code',
    '/two-factor/send-otp',
    '/two-factor/verify-otp',
  ],
  // Le jeton de réinitialisation n'est gardé qu'en empreinte, comme les liens d'invitation et les jetons d'API.
  verification: {
    storeIdentifier: { default: 'plain', overrides: { 'reset-password:': 'hashed' } },
  },
  advanced: {
    database: { generateId: 'uuid' },
    // L'adresse du client ne vient que de l'en-tête que pose le proxy de confiance (rate-limit.ts) ; sans lui,
    // aucune n'est lue : un en-tête choisi par le client ne vaut rien.
    ipAddress: env.LEON_IP_HEADER
      ? { ipAddressHeaders: [env.LEON_IP_HEADER] }
      : { disableIpTracking: true },
  },
  telemetry: { enabled: false },
  databaseHooks: {
    session: {
      create: {
        // La session porte l'organisation de l'utilisateur dès sa création.
        before: async (session) => ({
          data: { ...session, activeOrganizationId: await firstOrganizationId(session.userId) },
        }),
      },
    },
  },
  plugins: [
    // Rien n'est effacé : la suppression d'une organisation emporterait toute sa mémoire en cascade.
    // Une invitation ne s'accepte qu'avec un e-mail vérifié : sinon, quiconque s'inscrit avec
    // l'adresse invitée rejoint l'organisation (aucun e-mail n'est vérifié dans ce jet).
    organization({ disableOrganizationDeletion: true, requireEmailVerificationOnInvitation: true }),
    twoFactor({ issuer: 'Leon', totpOptions: { digits: 6, period: 30 } }),
    nextCookies(), // en dernier : cookies posés par les server actions
  ],
});
